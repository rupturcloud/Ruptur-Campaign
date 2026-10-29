import { Router } from 'express';
import { listGroups, syncGroups, extractGroupLeads, listLeadLists, createLeadList, getLeadList, addListMembers, promoteLeads, exportLeadList } from '../controllers/groupController';
const router = Router();
router.get('/', listGroups); router.post('/sync', syncGroups); router.post('/extract', extractGroupLeads);
router.get('/lists', listLeadLists); router.post('/lists', createLeadList); router.get('/lists/:id', getLeadList); router.post('/lists/:id/members', addListMembers); router.post('/promote', promoteLeads); router.get('/lists/:id/export', exportLeadList);
export default router;
