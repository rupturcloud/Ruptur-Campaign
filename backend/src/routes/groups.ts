import { Router } from 'express';
import {
  listGroups,
  syncGroups,
  extractGroupLeads,
  listLeadLists,
  createLeadList,
  getLeadList,
  addListMembers,
  promoteLeads,
  promoteLeadList,
  deleteLeadList,
  exportLeadList
} from '../controllers/groupController';

const router = Router();
router.get('/', listGroups);
router.post('/sync', syncGroups);
router.post('/extract', extractGroupLeads);
router.get('/lists', listLeadLists);
router.post('/lists', createLeadList);
router.get('/lists/:id', getLeadList);
router.post('/lists/:id/members', addListMembers);
router.post('/lists/:id/promote', promoteLeadList);
router.delete('/lists/:id', deleteLeadList);
router.post('/promote', promoteLeads);
router.get('/lists/:id/export', exportLeadList);

export default router;
