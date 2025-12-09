

// -----------------------------------------------------------------------------
// FILE: src/controllers/channelController.js
// Controllers for creating channels, listing, adding/removing members, and soft-delete
const ChannelModel = require('../models/channelModel');
const Organization = require('../models/organizationModel');
const UserModel = require('../models/userModel');

exports.createChannel = async (req, res) => {
  const { type = 'public', name, members = [] } = req.body;
  const orgId = req.user.organizationId;

  if (type === 'dm' && members.length !== 2) return res.status(400).json({ message: 'DM must have exactly 2 members' });

  // Ensure members belong to same org
  const invalid = await UserModel.findOne({ _id: { $in: members }, organizationId: { $ne: orgId } }).lean();
  if (invalid) return res.status(400).json({ message: 'All members must belong to organization' });

  const channel = await ChannelModel.create({ organizationId: orgId, type, name: name || (type === 'dm' ? null : 'Channel'), members: type === 'public' ? [] : members });
  return res.status(201).json(channel);
};

exports.listChannels = async (req, res) => {
  const orgId = req.user.organizationId;
  // Public channels + private channels where user is member
  const publicChannels = ChannelModel.find({ organizationId: orgId, type: 'public', isActive: true });
  const privateChannels = ChannelModel.find({ organizationId: orgId, type: { $in: ['private','dm'] }, members: req.user._id, isActive: true });
  const results = await Promise.all([publicChannels, privateChannels]);
  const merged = [...results[0], ...results[1]];
  res.json(merged);
};

exports.addMember = async (req, res) => {
  const { channelId } = req.params;
  const { userId } = req.body;
  const orgId = req.user.organizationId;

  const channel = await ChannelModel.findById(channelId);
  if (!channel) return res.status(404).json({ message: 'channel not found' });
  if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'forbidden' });

  if (channel.type === 'public') return res.status(400).json({ message: 'public channels do not have members' });

  const user = await UserModel.findById(userId);
  if (!user || String(user.organizationId) !== String(orgId)) return res.status(400).json({ message: 'invalid user' });

  if (!channel.members.some(m => String(m) === String(userId))) {
    channel.members.push(userId);
    await channel.save();
  }

  res.json(channel);
};

exports.removeMember = async (req, res) => {
  const { channelId, userId } = req.params;
  const orgId = req.user.organizationId;

  const channel = await ChannelModel.findById(channelId);
  if (!channel) return res.status(404).json({ message: 'channel not found' });
  if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'forbidden' });

  channel.members = (channel.members || []).filter(m => String(m) !== String(userId));
  await channel.save();
  res.json(channel);
};

exports.disableChannel = async (req, res) => {
  const { channelId } = req.params;
  const orgId = req.user.organizationId;
  const channel = await ChannelModel.findById(channelId);
  if (!channel) return res.status(404).json({ message: 'channel not found' });
  if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'forbidden' });
  channel.isActive = false;
  await channel.save();
  res.json(channel);
};

exports.enableChannel = async (req, res) => {
  const { channelId } = req.params;
  const orgId = req.user.organizationId;
  const channel = await ChannelModel.findById(channelId);
  if (!channel) return res.status(404).json({ message: 'channel not found' });
  if (String(channel.organizationId) !== String(orgId)) return res.status(403).json({ message: 'forbidden' });
  channel.isActive = true;
  await channel.save();
  res.json(channel);
};


// -----------------------------------------------------------------------------
// NOTES:
// - Replace require paths to models (userModel file name) if your user model filename differs.
// - Ensure auth middleware sets req.user with at least: {_id, organizationId}
// - This code is designed to be drop-in with the models you added (Channel and Message)
// - Add rate limiting on sendMessage at socket layer (not included here) and REST endpoints
// - Ensure proper input sanitization (escape HTML, validate attachments)
// - Add indexes on Message.createdAt and Message.channelId for performance

// End of canvas content
