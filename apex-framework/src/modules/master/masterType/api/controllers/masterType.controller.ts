import { Response } from 'express';
import { catchAsync } from '../../../../../core/http';
import { AuthenticatedRequest } from '../../../../../core/http/types';
import { MasterTypeService } from '../../application/services/masterType.service';
import { CreateMasterTypeInput, UpdateMasterTypeInput } from '../validators/masterType.validator';

const masterTypeService = new MasterTypeService();

export const createMasterType = catchAsync<Record<string, string>, unknown, CreateMasterTypeInput>(
  async (req: AuthenticatedRequest<Record<string, string>, unknown, CreateMasterTypeInput>, res: Response) => {
    const masterType = await masterTypeService.create(req.body);
    res.status(201).json({ status: 'success', data: { masterType } });
  }
);

export const getMasterTypes = catchAsync(async (_req: AuthenticatedRequest, res: Response) => {
  const masterTypes = await masterTypeService.list();
  res.status(200).json({ status: 'success', results: masterTypes.length, data: { masterTypes } });
});

export const updateMasterType = catchAsync<{ id: string }, unknown, UpdateMasterTypeInput>(
  async (req: AuthenticatedRequest<{ id: string }, unknown, UpdateMasterTypeInput>, res: Response) => {
    const masterType = await masterTypeService.update(req.params.id, req.body);
    res.status(200).json({ status: 'success', data: { masterType } });
  }
);

export const deleteMasterType = catchAsync<{ id: string }>(
  async (req: AuthenticatedRequest<{ id: string }>, res: Response) => {
    await masterTypeService.softDelete(req.params.id);
    res.status(200).json({ status: 'success', message: 'Master type deleted successfully' });
  }
);