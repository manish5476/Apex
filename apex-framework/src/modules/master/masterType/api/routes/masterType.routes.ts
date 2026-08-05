import { Router } from 'express';
import { validate } from '../../../../../core/http';
import { protect } from '../../../../../auth/core/auth.controller'; // ⚠️ not yet migrated
import {
  createMasterType,
  getMasterTypes,
  updateMasterType,
  deleteMasterType,
} from '../controllers/masterType.controller';
import {
  createMasterTypeSchema,
  updateMasterTypeSchema,
  masterTypeIdParamSchema,
} from '../validators/masterType.validator';

const router = Router();

router.use(protect);

router.post('/', validate(createMasterTypeSchema), createMasterType);
router.get('/', getMasterTypes);
router.patch('/:id', validate(updateMasterTypeSchema), updateMasterType);
router.delete('/:id', validate(masterTypeIdParamSchema), deleteMasterType);

export { router as masterTypeRouter };