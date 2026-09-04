import { Router } from 'express';
import { validate } from '../../../../../core/http';
import { protect } from '../../../../../auth/core/auth.controller'; // ⚠️ not yet migrated
import {
  createMasterRecord,
  getMasterRecords,
  updateMasterRecord,
  deleteMasterRecord,
  bulkCreateMasterRecords,
  bulkUpdateMasterRecords,
  bulkDeleteMasterRecords,
} from '../controllers/masterRecord.controller';
import {
  createMasterRecordSchema,
  listMasterRecordsSchema,
  updateMasterRecordSchema,
  masterRecordIdParamSchema,
  bulkCreateMasterRecordsSchema,
  bulkUpdateMasterRecordsSchema,
  bulkDeleteMasterRecordsSchema,
} from '../validators/masterRecord.validator';

const router = Router();

router.use(protect);

router.post('/', validate(createMasterRecordSchema), createMasterRecord);
router.get('/', validate(listMasterRecordsSchema), getMasterRecords);
router.patch('/:id', validate(updateMasterRecordSchema), updateMasterRecord);
router.delete('/:id', validate(masterRecordIdParamSchema), deleteMasterRecord);

router.post('/bulk', validate(bulkCreateMasterRecordsSchema), bulkCreateMasterRecords);
router.patch('/bulk', validate(bulkUpdateMasterRecordsSchema), bulkUpdateMasterRecords);
router.delete('/bulk', validate(bulkDeleteMasterRecordsSchema), bulkDeleteMasterRecords);

export { router as masterRecordRouter };