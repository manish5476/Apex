import { Router } from 'express';
import { masterRecordRouter } from './masterRecord';
import { masterTypeRouter } from './masterType';

const router = Router();

router.use('/records', masterRecordRouter);
router.use('/types', masterTypeRouter);

export { router as masterModuleRouter };
export * from './masterRecord';
export * from './masterType';