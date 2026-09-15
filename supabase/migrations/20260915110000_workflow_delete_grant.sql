-- Grant DELETE on workflow tables to service_role so the admin client can delete
-- workflows and their enrollments from the UI.
-- Enrollments CASCADE on workflow delete; this grant covers explicit enrollment cleanup too.

GRANT DELETE ON crm_workflow TO service_role;
GRANT DELETE ON crm_workflow_enrollment TO service_role;
