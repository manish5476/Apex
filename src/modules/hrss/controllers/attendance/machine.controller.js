const catchAsync = require('../../../core/utils/catchAsync');
const machineService = require('../../services/attendance/machine.service');

class MachineController {
  
  // Push machine data
  pushMachineData = catchAsync(async (req, res, next) => {
    const apiKey = req.headers['x-machine-api-key'];
    const machineIp = req.ip;
    
    // Authenticate machine
    const machine = await machineService.authenticateMachine(apiKey, machineIp);
    
    // Process data
    const result = await machineService.processMachineData(machine, req.body);
    
    res.status(200).json({
      status: 'success',
      ...result,
      machine: machine.name
    });
  });
  
  // Create machine
  createMachine = catchAsync(async (req, res, next) => {
    const data = {
      ...req.body,
      organizationId: req.user.organizationId
    };
    
    const result = await machineService.createMachine(data);
    
    res.status(201).json({
      status: 'success',
      data: result.machine,
      apiKey: result.apiKey
    });
  });
  
  // Get all machines
  getAllMachines = catchAsync(async (req, res, next) => {
    const machines = await require('../../models/attendance/attendanceMachine.model')
      .find({ organizationId: req.user.organizationId })
      .sort({ createdAt: -1 })
      .select('-apiKey');
    
    res.status(200).json({
      status: 'success',
      results: machines.length,
      data: machines
    });
  });
  
  // Update machine
  updateMachine = catchAsync(async (req, res, next) => {
    const machine = await require('../../models/attendance/attendanceMachine.model')
      .findOneAndUpdate(
        { _id: req.params.id, organizationId: req.user.organizationId },
        req.body,
        { new: true, runValidators: true }
      )
      .select('-apiKey');
    
    if (!machine) {
      return next(new AppError('Machine not found', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: machine
    });
  });
  
  // Delete machine
  deleteMachine = catchAsync(async (req, res, next) => {
    const machine = await require('../../models/attendance/attendanceMachine.model')
      .findOneAndDelete({ 
        _id: req.params.id, 
        organizationId: req.user.organizationId 
      });
    
    if (!machine) {
      return next(new AppError('Machine not found', 404));
    }
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  });
}

module.exports = new MachineController();