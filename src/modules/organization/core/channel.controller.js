const ChannelModel = require('./channel.model');
const UserModel = require('../../auth/core/user.model');
const Message = require("../../notification/core/message.model");
const catchAsync = require("../../../core/utils/catchAsync");

exports.createChannel = async (req, res) => {
  try {
    const { type = 'public', name, members = [] } = req.body;
    const orgId = req.user.organizationId;
    const creatorId = req.user._id;

    if (type === 'dm') {
      const existingDM = await ChannelModel.findOne({
        organizationId: orgId,
        type: 'dm',
        members: { $all: finalMembers, $size: 2 }
      });
      if (existingDM) return res.status(200).json(existingDM); // Return existing instead of 400 or duplicate
    }

    // 2. Ensure all invited members belong to the same organization
    if (members.length > 0) {
      const invalid = await UserModel.findOne({
        _id: { $in: members },
        organizationId: { $ne: orgId }
      }).lean();

      if (invalid) {
        return res.status(400).json({ message: 'All members must belong to the organization' });
      }
    }

    // 3. 🔥 CRITICAL FIX: Add Creator to members if Private/DM
    // Clone array to avoid mutating req.body
    let finalMembers = [...members];

    if (type === 'private' || type === 'dm') {
      const isCreatorIncluded = finalMembers.some(m => String(m) === String(creatorId));
      if (!isCreatorIncluded) {
        finalMembers.push(creatorId);
      }
    }

    // 4. Create the Channel
    const channel = await ChannelModel.create({
      organizationId: orgId,
      type,
      name: name || (type === 'dm' ? null : 'New Channel'),
      members: type === 'public' ? [] : finalMembers
    });

    return res.status(201).json(channel);

  } catch (err) {
    console.error('Create Channel Error:', err);
    return res.status(500).json({ message: 'Server error creating channel' });
  }
};

exports.listChannels = async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const userId = req.user._id;

    // 1. Get all Public Channels in this Org
    const publicChannels = ChannelModel.find({
      organizationId: orgId,
      type: 'public',
      isActive: true
    });

    // 2. Get Private Channels where I AM A MEMBER
    const privateChannels = ChannelModel.find({
      organizationId: orgId,
      type: { $in: ['private', 'dm'] },
      members: userId,
      isActive: true
    });

    const [pub, priv] = await Promise.all([publicChannels, privateChannels]);

    // Merge and return
    res.json([...pub, ...priv]);
  } catch (err) {
    console.error('List Channels Error:', err);
    res.status(500).json({ message: 'Server error listing channels' });
  }
};

exports.addMember = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { userId } = req.body;
    const orgId = req.user.organizationId;

    const channel = await ChannelModel.findById(channelId);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'Forbidden' });

    if (channel.type === 'public') return res.status(400).json({ message: 'Public channels do not have specific members' });

    const user = await UserModel.findById(userId);
    if (!user || String(user.organizationId) !== String(orgId)) return res.status(400).json({ message: 'Invalid user' });

    // Add if not already present
    if (!channel.members.some(m => String(m) === String(userId))) {
      channel.members.push(userId);
      await channel.save();
    }

    res.json(channel);
  } catch (err) {
    res.status(500).json({ message: 'Server error adding member' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { channelId, userId } = req.params;
    const orgId = req.user.organizationId;

    // Inside removeMember
    if (req.user._id.toString() === userId.toString()) {
      // Allow self-leaving
    } else {
      // If removing someone else, check if actor is Admin/Owner
      if (!req.user.isOwner && !req.user.isSuperAdmin) {
        return res.status(403).json({ message: 'Only admins can remove other members' });
      }
    }

    const channel = await ChannelModel.findById(channelId);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'Forbidden' });

    channel.members = (channel.members || []).filter(m => String(m) !== String(userId));
    await channel.save();
    res.json(channel);
  } catch (err) {
    res.status(500).json({ message: 'Server error removing member' });
  }
};

exports.disableChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    const orgId = req.user.organizationId;

    const channel = await ChannelModel.findById(channelId);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'Forbidden' });

    channel.isActive = false;
    await channel.save();
    res.json(channel);
  } catch (err) {
    res.status(500).json({ message: 'Server error disabling channel' });
  }
};

exports.enableChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    const orgId = req.user.organizationId;

    const channel = await ChannelModel.findById(channelId);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'Forbidden' });

    channel.isActive = true;
    await channel.save();
    res.json(channel);
  } catch (err) {
    res.status(500).json({ message: 'Server error enabling channel' });
  }
};



exports.globalSearch = catchAsync(async (req, res, next) => {
  const q = req.query.q || "";
  const orgId = req.user.organizationId;
  const userId = req.user._id;
  const limit = 5;

  if (!q || q.length < 2) return res.status(200).json({ status: "success", data: {} });

  const regex = { $regex: q, $options: "i" };

  // 🟢 PERFECTION: Parallel execution across all business domains
  const [customers, products, invoices, channels, messages] = await Promise.all([
    Customer.find({ organizationId: orgId, $or: [{ name: regex }, { phone: regex }] })
      .limit(limit).select("name phone email").lean(),

    Product.find({ organizationId: orgId, $or: [{ name: regex }, { sku: regex }] })
      .limit(limit).select("name sku price stock").lean(),

    Invoice.find({ organizationId: orgId, invoiceNumber: regex })
      .limit(limit).select("invoiceNumber grandTotal status").lean(),

    // 💬 CHAT SEARCH: Only show channels the user has access to
    Channel.find({ 
      organizationId: orgId, 
      name: regex,
      $or: [{ type: 'public' }, { members: userId }] 
    }).limit(limit).select("name type").lean(),

    // ✉️ MESSAGE SEARCH: Search content within user's accessible channels
    Message.find({
      organizationId: orgId,
      body: regex,
      deleted: false
    })
    .populate('channelId', 'name')
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean()
  ]);

  res.status(200).json({
    status: "success",
    data: { customers, products, invoices, channels, messages }
  });
});