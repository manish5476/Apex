const ChannelModel = require('./channel.model');
const UserModel = require('../../auth/core/user.model');
const Message = require("../../notification/core/message.model");
const Customer = require("../../organization/core/customer.model");
const Product = require("../../inventory/core/product.model");
const Invoice = require("../../accounting/billing/invoice.model");
const catchAsync = require("../../../core/utils/api/catchAsync");
const socketUtil = require('../../../socketHandlers/socket');

// ==============================================================================
// 1. ADD MEMBER
// ==============================================================================
exports.addMember = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { userId } = req.body; 
    const orgId = req.user.organizationId;

    // Atomic update: only adds if user is not already in the array
    const channel = await ChannelModel.findOneAndUpdate(
      { _id: channelId, organizationId: orgId, members: { $ne: userId } },
      { $addToSet: { members: userId } },
      { new: true }
    );

    if (!channel) {
      const exists = await ChannelModel.exists({ _id: channelId, organizationId: orgId });
      if (exists) return res.status(400).json({ message: 'User is already a member' });
      return res.status(404).json({ message: 'Channel not found' });
    }

    socketUtil.emitToUser(userId, 'addMember', channel);
    socketUtil.emitToChannel(channelId, 'userJoinedChannel', { channelId, userId, timestamp: new Date() });

    res.json(channel);
  } catch (err) {
    console.error('Add Member Error:', err);
    res.status(500).json({ message: 'Server error adding member' });
  }
};

// ==============================================================================
// 2. REMOVE MEMBER
// ==============================================================================
exports.removeMember = async (req, res) => {
  try {
    const { channelId, userId } = req.params;
    const orgId = req.user.organizationId;
    const actorId = req.user._id;
    const userRole = req.user.role;

    if (String(actorId) !== String(userId)) {
      if (!['admin', 'superadmin', 'owner'].includes(userRole)) {
        return res.status(403).json({ message: 'Only admins can remove other members' });
      }
    }

    const channel = await ChannelModel.findOne({ _id: channelId, organizationId: orgId });
    if (!channel) return res.status(404).json({ message: 'Channel not found' });

    channel.members = channel.members.filter(m => String(m) !== String(userId));
    await channel.save();

    socketUtil.emitToChannel(channelId, 'userLeftChannel', { channelId, userId, kickedBy: actorId });
    socketUtil.emitToUser(userId, 'removedFromChannel', { channelId });

    res.json(channel);
  } catch (err) {
    console.error('Remove Member Error:', err);
    res.status(500).json({ message: 'Server error removing member' });
  }
};

// ==============================================================================
// 3. LEAVE CHANNEL
// ==============================================================================
exports.leaveChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user._id;
    const orgId = req.user.organizationId;

    const channel = await ChannelModel.findOne({ _id: channelId, organizationId: orgId });
    if (!channel) return res.status(404).json({ message: 'Channel not found' });

    const initialCount = channel.members.length;
    channel.members = channel.members.filter(m => String(m) !== String(userId));

    if (channel.members.length === initialCount) {
      return res.status(400).json({ message: 'You are not a member of this channel' });
    }

    await channel.save();

    socketUtil.emitToChannel(channelId, 'userLeftChannel', { channelId, userId });
    socketUtil.emitToUser(userId, 'removedFromChannel', { channelId });

    res.json({ success: true, message: 'Left channel successfully' });
  } catch (err) {
    console.error('Leave Channel Error:', err);
    res.status(500).json({ message: 'Server error leaving channel' });
  }
};

// ==============================================================================
// 4. CREATE CHANNEL
// ==============================================================================
exports.createChannel = async (req, res) => {
  try {
    const { type = 'public', name, members = [] } = req.body;
    const orgId = req.user.organizationId;
    const creatorId = req.user._id;

    let finalMembers = [...members];

    if (type === 'private' || type === 'dm') {
      const isCreatorIncluded = finalMembers.some(m => String(m) === String(creatorId));
      if (!isCreatorIncluded) finalMembers.push(String(creatorId));
    }

    if (type === 'dm') {
      const existingDM = await ChannelModel.findOne({
        organizationId: orgId,
        type: 'dm',
        members: { $all: finalMembers, $size: finalMembers.length }
      });
      if (existingDM) return res.status(200).json(existingDM);
    }

    const channel = await ChannelModel.create({
      organizationId: orgId,
      type,
      name: name || (type === 'dm' ? null : 'New Channel'),
      members: type === 'public' ? [] : finalMembers,
      createdBy: creatorId,
      isActive: true
    });

    if (type === 'public') {
      socketUtil.emitToOrg(orgId, 'channelCreated', channel);
    } else {
      socketUtil.emitToUsers(finalMembers, 'channelCreated', channel);
    }

    return res.status(201).json(channel);
  } catch (err) {
    console.error('Create Channel Error:', err);
    return res.status(500).json({ message: 'Server error creating channel' });
  }
};

// ==============================================================================
// 5. LIST CHANNELS
// ==============================================================================
exports.listChannels = async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const userId = req.user._id;

    const publicChannels = ChannelModel.find({ organizationId: orgId, type: 'public', isActive: true }).lean();
    const privateChannels = ChannelModel.find({ organizationId: orgId, type: { $in: ['private', 'dm'] }, members: userId, isActive: true }).lean();

    const [pub, priv] = await Promise.all([publicChannels, privateChannels]);

    res.json([...pub, ...priv]);
  } catch (err) {
    console.error('List Channels Error:', err);
    res.status(500).json({ message: 'Server error listing channels' });
  }
};

// ==============================================================================
// 6. DISABLE / ENABLE CHANNEL
// ==============================================================================
exports.disableChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    const channel = await ChannelModel.findOneAndUpdate(
      { _id: channelId, organizationId: req.user.organizationId },
      { isActive: false },
      { new: true }
    );
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    res.json(channel);
  } catch (err) {
    res.status(500).json({ message: 'Server error disabling channel' });
  }
};

exports.enableChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    const channel = await ChannelModel.findOneAndUpdate(
      { _id: channelId, organizationId: req.user.organizationId },
      { isActive: true },
      { new: true }
    );
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    res.json(channel);
  } catch (err) {
    res.status(500).json({ message: 'Server error enabling channel' });
  }
};

// ==============================================================================
// 7. GLOBAL SEARCH
// ==============================================================================
exports.globalSearch = catchAsync(async (req, res, next) => {
  const q = req.query.q || "";
  const orgId = req.user.organizationId;
  const userId = req.user._id;
  const limit = 5;

  if (!q || q.length < 2) return res.status(200).json({ status: "success", data: {} });

  const regex = { $regex: q, $options: "i" };

  const [customers, products, invoices, channels, messages] = await Promise.all([
    Customer.find({ organizationId: orgId, $or: [{ name: regex }, { phone: regex }] })
      .limit(limit).select("name phone email").lean(),

    Product.find({ organizationId: orgId, $or: [{ name: regex }, { sku: regex }] })
      .limit(limit).select("name sku price stock").lean(),

    Invoice.find({ organizationId: orgId, invoiceNumber: regex })
      .limit(limit).select("invoiceNumber grandTotal status").lean(),

    Channel.find({
      organizationId: orgId,
      name: regex,
      $or: [{ type: 'public' }, { members: userId }]
    }).limit(limit).select("name type").lean(),

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

// const ChannelModel = require('./channel.model');
// const UserModel = require('../../auth/core/user.model');
// const Message = require("../../notification/core/message.model");
// const catchAsync = require("../../../core/utils/api/catchAsync");
// const socketUtil = require('../../../socketHandlers/socket');

// // ✅ 1. ADD MEMBERS
// exports.addMember = async (req, res) => {
//   try {
//     const { channelId } = req.params;
//     const { userId } = req.body; // Expecting a single userId to add
//     const orgId = req.user.organizationId;

//     const channel = await ChannelModel.findOne({ _id: channelId, organizationId: orgId });
//     if (!channel) return res.status(404).json({ message: 'Channel not found' });

//     // Check if user is already a member
//     if (channel.members.includes(userId)) {
//       return res.status(400).json({ message: 'User is already a member' });
//     }

//     // Add user to DB
//     channel.members.push(userId);
//     await channel.save();

//     // ⚡ REAL-TIME UPDATE
//     // 1. Notify the user they were added (so the channel appears in their list)
//     socketUtil.emitToUser(userId, 'addMember', channel);
//     // 2. Notify the channel that a user joined (to update member counts/lists)
//     socketUtil.emitToChannel(channelId, 'userJoinedChannel', {
//       channelId,
//       userId,
//       timestamp: new Date()
//     });

//     res.json(channel);
//   } catch (err) {
//     console.error('Add Member Error:', err);
//     res.status(500).json({ message: 'Server error adding member' });
//   }
// };

// // ✅ 2. REMOVE MEMBER (For Admins removing others)
// exports.removeMember = async (req, res) => {
//   try {
//     const { channelId, userId } = req.params;
//     const orgId = req.user.organizationId;
//     const actorId = req.user._id;

//     // 🔍 DEBUGGING LOG: Check what permissions the server thinks you have
//     console.log('--- PERMISSION DEBUG ---');
//     console.log('Actor ID:', actorId);
//     console.log('Is Owner?', req.user.isOwner);
//     console.log('Is SuperAdmin?', req.user.isSuperAdmin);
//     console.log('Role:', req.user.role);
//     console.log('------------------------');

//     // Permissions: Only Admin/Owner can remove OTHERS
//     if (String(actorId) !== String(userId)) {
//       // You can check your specific permission flags here
//       if (!req.user.isOwner && !req.user.isSuperAdmin) {
//         return res.status(403).json({ message: 'Only admins can remove other members' });
//       }
//     }

//     const channel = await ChannelModel.findOne({ _id: channelId, organizationId: orgId });
//     if (!channel) return res.status(404).json({ message: 'Channel not found' });

//     // Remove from DB
//     channel.members = channel.members.filter(m => String(m) !== String(userId));
//     await channel.save();

//     // ⚡ REAL-TIME UPDATE
//     socketUtil.emitToChannel(channelId, 'userLeftChannel', {
//       channelId,
//       userId,
//       kickedBy: actorId
//     });

//     // Also explicitly tell the removed user's socket to leave the room
//     // (This requires a specific socket event we'll handle in the service)
//     socketUtil.emitToUser(userId, 'removedFromChannel', { channelId });

//     res.json(channel);
//   } catch (err) {
//     console.error('Remove Member Error:', err);
//     res.status(500).json({ message: 'Server error removing member' });
//   }
// };

// // ✅ 3. LEAVE CHANNEL (For users leaving themselves)
// exports.leaveChannel = async (req, res) => {
//   try {
//     const { channelId } = req.params;
//     const userId = req.user._id;
//     const orgId = req.user.organizationId;

//     const channel = await ChannelModel.findOne({ _id: channelId, organizationId: orgId });
//     if (!channel) return res.status(404).json({ message: 'Channel not found' });

//     // Remove self
//     const initialCount = channel.members.length;
//     channel.members = channel.members.filter(m => String(m) !== String(userId));

//     if (channel.members.length === initialCount) {
//       return res.status(400).json({ message: 'You are not a member of this channel' });
//     }

//     await channel.save();

//     // ⚡ REAL-TIME UPDATE
//     socketUtil.emitToChannel(channelId, 'userLeftChannel', {
//       channelId,
//       userId
//     });

//     res.json({ success: true, message: 'Left channel successfully' });
//   } catch (err) {
//     console.error('Leave Channel Error:', err);
//     res.status(500).json({ message: 'Server error leaving channel' });
//   }
// };


// exports.createChannel = async (req, res) => {
//   try {
//     const { type = 'public', name, members = [] } = req.body;
//     const orgId = req.user.organizationId;
//     const creatorId = req.user._id;

//     // ✅ FIX 1: Define finalMembers at the very top
//     let finalMembers = [...members];

//     // ✅ FIX 2: Ensure Creator is in the list BEFORE checking for existing DMs
//     if (type === 'private' || type === 'dm') {
//       const isCreatorIncluded = finalMembers.some(m => String(m) === String(creatorId));
//       if (!isCreatorIncluded) {
//         finalMembers.push(String(creatorId));
//       }
//     }

//     if (type === 'dm') {
//       // Now this works because finalMembers is defined
//       const existingDM = await ChannelModel.findOne({
//         organizationId: orgId,
//         type: 'dm',
//         // Ensure strictly only these 2 members exist
//         members: { $all: finalMembers, $size: finalMembers.length }
//       });
//       if (existingDM) return res.status(200).json(existingDM);
//     }

//     // 4. Create the Channel
//     const channel = await ChannelModel.create({
//       organizationId: orgId,
//       type,
//       name: name || (type === 'dm' ? null : 'New Channel'),
//       members: type === 'public' ? [] : finalMembers,
//       createdBy: creatorId, // ✅ SAVE THE CREATOR
//       isActive: true
//     });

//     // ======================================================
//     // ⚡ REAL-TIME UPDATE (THE FIX)
//     // ======================================================

//     if (type === 'public') {
//       // Scenario A: Public Channel -> Show to EVERYONE in the Org
//       socketUtil.emitToOrg(orgId, 'channelCreated', channel);

//     } else {
//       // Scenario B: Private/DM -> Show ONLY to the members
//       // We loop through members and send the event to each one
//       const memberIds = finalMembers.map(m => String(m));
//       socketUtil.emitToUsers(memberIds, 'channelCreated', channel);
//     }

//     return res.status(201).json(channel);

//   } catch (err) {
//     console.error('Create Channel Error:', err);
//     return res.status(500).json({ message: 'Server error creating channel' });
//   }
// };

// exports.listChannels = async (req, res) => {
//   try {
//     const orgId = req.user.organizationId;
//     const userId = req.user._id;

//     // 1. Get all Public Channels in this Org
//     const publicChannels = ChannelModel.find({
//       organizationId: orgId,
//       type: 'public',
//       isActive: true
//     });

//     // 2. Get Private Channels where I AM A MEMBER
//     const privateChannels = ChannelModel.find({
//       organizationId: orgId,
//       type: { $in: ['private', 'dm'] },
//       members: userId,
//       isActive: true
//     });

//     const [pub, priv] = await Promise.all([publicChannels, privateChannels]);

//     // Merge and return
//     res.json([...pub, ...priv]);
//   } catch (err) {
//     console.error('List Channels Error:', err);
//     res.status(500).json({ message: 'Server error listing channels' });
//   }
// }; 

// exports.disableChannel = async (req, res) => {
//   try {
//     const { channelId } = req.params;
//     const orgId = req.user.organizationId;

//     const channel = await ChannelModel.findById(channelId);
//     if (!channel) return res.status(404).json({ message: 'Channel not found' });
//     if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'Forbidden' });

//     channel.isActive = false;
//     await channel.save();
//     res.json(channel);
//   } catch (err) {
//     res.status(500).json({ message: 'Server error disabling channel' });
//   }
// };

// exports.enableChannel = async (req, res) => {
//   try {
//     const { channelId } = req.params;
//     const orgId = req.user.organizationId;

//     const channel = await ChannelModel.findById(channelId);
//     if (!channel) return res.status(404).json({ message: 'Channel not found' });
//     if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'Forbidden' });

//     channel.isActive = true;
//     await channel.save();
//     res.json(channel);
//   } catch (err) {
//     res.status(500).json({ message: 'Server error enabling channel' });
//   }
// };



// exports.globalSearch = catchAsync(async (req, res, next) => {
//   const q = req.query.q || "";
//   const orgId = req.user.organizationId;
//   const userId = req.user._id;
//   const limit = 5;

//   if (!q || q.length < 2) return res.status(200).json({ status: "success", data: {} });

//   const regex = { $regex: q, $options: "i" };

//   // 🟢 PERFECTION: Parallel execution across all business domains
//   const [customers, products, invoices, channels, messages] = await Promise.all([
//     Customer.find({ organizationId: orgId, $or: [{ name: regex }, { phone: regex }] })
//       .limit(limit).select("name phone email").lean(),

//     Product.find({ organizationId: orgId, $or: [{ name: regex }, { sku: regex }] })
//       .limit(limit).select("name sku price stock").lean(),

//     Invoice.find({ organizationId: orgId, invoiceNumber: regex })
//       .limit(limit).select("invoiceNumber grandTotal status").lean(),

//     // 💬 CHAT SEARCH: Only show channels the user has access to
//     Channel.find({
//       organizationId: orgId,
//       name: regex,
//       $or: [{ type: 'public' }, { members: userId }]
//     }).limit(limit).select("name type").lean(),

//     // ✉️ MESSAGE SEARCH: Search content within user's accessible channels
//     Message.find({
//       organizationId: orgId,
//       body: regex,
//       deleted: false
//     })
//       .populate('channelId', 'name')
//       .limit(limit)
//       .sort({ createdAt: -1 })
//       .lean()
//   ]);

//   res.status(200).json({
//     status: "success",
//     data: { customers, products, invoices, channels, messages }
//   });
// });