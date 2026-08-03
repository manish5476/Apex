const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

exports.createMachineSchema = z.object({
  name: z.string().min(2),
  serialNumber: z.string().min(2),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  firmwareVersion: z.string().optional(),
  branchId: z.string().regex(objectIdRegex, 'Invalid Branch ID'),
  ipAddress: z.string().ip().optional(),
  macAddress: z.string().optional(),
  providerType: z.enum(['generic', 'zkteco', 'hikvision', 'essl', 'bioenable', 'suprema']).default('generic'),
  connectionProtocol: z.enum(['tcp', 'http', 'websocket', 'mqtt', 'usb']).default('http'),
  port: z.number().min(1).max(65535).optional(),
  timeout: z.number().min(1000).default(5000),
  capabilities: z.object({
    faceRecognition: z.boolean().default(false),
    fingerprint: z.boolean().default(true),
    rfid: z.boolean().default(false),
    temperature: z.boolean().default(false),
    maskDetection: z.boolean().default(false),
  }).optional(),
  config: z.object({
    timezone: z.string().default('Asia/Kolkata'),
    syncInterval: z.number().min(1).default(5),
    retryAttempts: z.number().min(0).default(3),
    autoSync: z.boolean().default(true),
  }).optional()
});

exports.updateMachineSchema = exports.createMachineSchema.partial();

exports.bulkStatusSchema = z.object({
  machineIds: z.array(z.string().regex(objectIdRegex)).min(1),
  status: z.enum(['active', 'inactive', 'maintenance', 'offline', 'error']),
  reason: z.string().optional()
});

exports.mapUserSchema = z.object({
  userId: z.string().regex(objectIdRegex),
  machineUserId: z.string().min(1)
});

exports.bulkMapSchema = z.object({
  deviceId: z.string().optional(),
  mappings: z.array(z.object({
    userId: z.string().regex(objectIdRegex),
    machineUserId: z.string().min(1)
  })).min(1)
});