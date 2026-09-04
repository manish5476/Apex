import { Response } from 'express';
import { catchAsync } from '../../../../../core/http';
import { AuthenticatedRequest } from '../../../../../core/http/types';
import { MasterRecordService } from '../../application/services/masterRecord.service';
import {
  CreateMasterRecordInput,
  UpdateMasterRecordInput,
  BulkCreateMasterRecordsInput,
  BulkUpdateMasterRecordsInput,
  BulkDeleteMasterRecordsInput,
} from '../validators/masterRecord.validator';

const masterRecordService = new MasterRecordService();

export const createMasterRecord = catchAsync<Record<string, string>, unknown, CreateMasterRecordInput>(
  async (req: AuthenticatedRequest<Record<string, string>, unknown, CreateMasterRecordInput>, res: Response) => {
    const master = await masterRecordService.create(req.body, req.user);
    res.status(201).json({ status: 'success', data: { master } });
  }
);

export const getMasterRecords = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { type, ...rest } = req.query as { type?: string };
  const result = await masterRecordService.list(req.user.organizationId, type, rest);

  res.status(200).json({
    status: 'success',
    results: result.results,
    pagination: result.pagination,
    data: {
      masters: result.data,
      totalRecords: result.pagination
        ? (result.pagination as { totalResults: number }).totalResults
        : result.results,
    },
  });
});

export const updateMasterRecord = catchAsync<{ id: string }, unknown, UpdateMasterRecordInput>(
  async (req: AuthenticatedRequest<{ id: string }, unknown, UpdateMasterRecordInput>, res: Response) => {
    const master = await masterRecordService.update(req.params.id, req.user.organizationId, req.body);
    res.status(200).json({ status: 'success', data: { master } });
  }
);

export const deleteMasterRecord = catchAsync<{ id: string }>(
  async (req: AuthenticatedRequest<{ id: string }>, res: Response) => {
    await masterRecordService.softDelete(req.params.id, req.user.organizationId);
    res.status(200).json({ status: 'success', message: 'Master deactivated successfully' });
  }
);

export const bulkCreateMasterRecords = catchAsync<Record<string, string>, unknown, BulkCreateMasterRecordsInput>(
  async (req: AuthenticatedRequest<Record<string, string>, unknown, BulkCreateMasterRecordsInput>, res: Response) => {
    const result = await masterRecordService.bulkCreate(req.body.items, req.user);

    if (result.status === 'partial_success') {
      res.status(207).json({
        status: 'partial_success',
        insertedCount: result.insertedCount,
        failedCount: result.failedCount,
        failedItems: result.failedItems,
        data: { masters: result.masters },
      });
      return;
    }

    res.status(201).json({
      status: 'success',
      insertedCount: result.insertedCount,
      data: { masters: result.masters },
    });
  }
);

export const bulkUpdateMasterRecords = catchAsync<Record<string, string>, unknown, BulkUpdateMasterRecordsInput>(
  async (req: AuthenticatedRequest<Record<string, string>, unknown, BulkUpdateMasterRecordsInput>, res: Response) => {
    const result = await masterRecordService.bulkUpdate(req.body.items, req.user.organizationId);
    res.status(200).json({
      status: 'success',
      message: 'Bulk update completed',
      modifiedCount: result.modifiedCount,
    });
  }
);

export const bulkDeleteMasterRecords = catchAsync<Record<string, string>, unknown, BulkDeleteMasterRecordsInput>(
  async (req: AuthenticatedRequest<Record<string, string>, unknown, BulkDeleteMasterRecordsInput>, res: Response) => {
    const result = await masterRecordService.bulkDelete(req.body.ids, req.user.organizationId);
    res.status(200).json({
      status: 'success',
      message: `${result.modifiedCount} items deactivated successfully`,
    });
  }
);