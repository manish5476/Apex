// src/controllers/channelController.js
const ChannelModel = require('../models/channelModel');
const UserModel = require('../models/userModel');

exports.createChannel = async (req, res) => {
  try {
    const { type = 'public', name, members = [] } = req.body;
    const orgId = req.user.organizationId;
    const creatorId = req.user._id; 

    // 1. Validation for DM
    if (type === 'dm' && members.length !== 2) {
      return res.status(400).json({ message: 'DM must have exactly 2 members' });
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


// // -----------------------------------------------------------------------------
// // FILE: src/controllers/channelController.js
// // Controllers for creating channels, listing, adding/removing members, and soft-delete
// const ChannelModel = require('../models/channelModel');
// const Organization = require('../models/organizationModel');
// const UserModel = require('../models/userModel');

// exports.createChannel = async (req, res) => {
//   const { type = 'public', name, members = [] } = req.body;
//   const orgId = req.user.organizationId;

//   if (type === 'dm' && members.length !== 2) return res.status(400).json({ message: 'DM must have exactly 2 members' });

//   // Ensure members belong to same org
//   const invalid = await UserModel.findOne({ _id: { $in: members }, organizationId: { $ne: orgId } }).lean();
//   if (invalid) return res.status(400).json({ message: 'All members must belong to organization' });

//   const channel = await ChannelModel.create({ organizationId: orgId, type, name: name || (type === 'dm' ? null : 'Channel'), members: type === 'public' ? [] : members });
//   return res.status(201).json(channel);
// };

// exports.listChannels = async (req, res) => {
//   const orgId = req.user.organizationId;
//   // Public channels + private channels where user is member
//   const publicChannels = ChannelModel.find({ organizationId: orgId, type: 'public', isActive: true });
//   const privateChannels = ChannelModel.find({ organizationId: orgId, type: { $in: ['private','dm'] }, members: req.user._id, isActive: true });
//   const results = await Promise.all([publicChannels, privateChannels]);
//   const merged = [...results[0], ...results[1]];
//   res.json(merged);
// };

// exports.addMember = async (req, res) => {
//   const { channelId } = req.params;
//   const { userId } = req.body;
//   const orgId = req.user.organizationId;

//   const channel = await ChannelModel.findById(channelId);
//   if (!channel) return res.status(404).json({ message: 'channel not found' });
//   if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'forbidden' });

//   if (channel.type === 'public') return res.status(400).json({ message: 'public channels do not have members' });

//   const user = await UserModel.findById(userId);
//   if (!user || String(user.organizationId) !== String(orgId)) return res.status(400).json({ message: 'invalid user' });

//   if (!channel.members.some(m => String(m) === String(userId))) {
//     channel.members.push(userId);
//     await channel.save();
//   }

//   res.json(channel);
// };

// exports.removeMember = async (req, res) => {
//   const { channelId, userId } = req.params;
//   const orgId = req.user.organizationId;

//   const channel = await ChannelModel.findById(channelId);
//   if (!channel) return res.status(404).json({ message: 'channel not found' });
//   if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'forbidden' });

//   channel.members = (channel.members || []).filter(m => String(m) !== String(userId));
//   await channel.save();
//   res.json(channel);
// };

// exports.disableChannel = async (req, res) => {
//   const { channelId } = req.params;
//   const orgId = req.user.organizationId;
//   const channel = await ChannelModel.findById(channelId);
//   if (!channel) return res.status(404).json({ message: 'channel not found' });
//   if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'forbidden' });
//   channel.isActive = false;
//   await channel.save();
//   res.json(channel);
// };

// exports.enableChannel = async (req, res) => {
//   const { channelId } = req.params;
//   const orgId = req.user.organizationId;
//   const channel = await ChannelModel.findById(channelId);
//   if (!channel) return res.status(404).json({ message: 'channel not found' });
//   if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'forbidden' });
//   channel.isActive = true;
//   await channel.save();
//   res.json(channel);
// };


// // -----------------------------------------------------------------------------
// // NOTES:
// // - Replace require paths to models (userModel file name) if your user model filename differs.
// // - Ensure auth middleware sets req.user with at least: {_id, organizationId}
// // - This code is designed to be drop-in with the models you added (Channel and Message)
// // - Add rate limiting on sendMessage at socket layer (not included here) and REST endpoints
// // - Ensure proper input sanitization (escape HTML, validate attachments)
// // - Add indexes on Message.createdAt and Message.channelId for performance

// // End of canvas content
