// Author-only B fixture values. No I/O; absent values stay empty and fail guards.
output.userId = (typeof MAESTRO_B_USER_ID === 'undefined' || MAESTRO_B_USER_ID === null) ? '' : String(MAESTRO_B_USER_ID).trim();
output.milestoneId = (typeof MAESTRO_B_MILESTONE_ID === 'undefined' || MAESTRO_B_MILESTONE_ID === null) ? '' : String(MAESTRO_B_MILESTONE_ID).trim();
output.assignmentId = (typeof MAESTRO_B_ASSIGNMENT_ID === 'undefined' || MAESTRO_B_ASSIGNMENT_ID === null) ? '' : String(MAESTRO_B_ASSIGNMENT_ID).trim();
output.projectName = (typeof MAESTRO_B_PROJECT_NAME === 'undefined' || MAESTRO_B_PROJECT_NAME === null) ? '' : String(MAESTRO_B_PROJECT_NAME).trim();
output.milestoneName = (typeof MAESTRO_B_MILESTONE_NAME === 'undefined' || MAESTRO_B_MILESTONE_NAME === null) ? '' : String(MAESTRO_B_MILESTONE_NAME).trim();
output.assignmentLabel = (typeof MAESTRO_B_ASSIGNMENT_LABEL === 'undefined' || MAESTRO_B_ASSIGNMENT_LABEL === null) ? '' : String(MAESTRO_B_ASSIGNMENT_LABEL).trim();
output.fixtureAttestation = (typeof MAESTRO_B_UI_FIXTURE_ATTESTATION === 'undefined' || MAESTRO_B_UI_FIXTURE_ATTESTATION === null) ? '' : String(MAESTRO_B_UI_FIXTURE_ATTESTATION).trim();
output.serial = (typeof MAESTRO_B_SERIAL === 'undefined' || MAESTRO_B_SERIAL === null) ? '' : String(MAESTRO_B_SERIAL).trim();
function exact(value) { return '^' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'; }
output.activeUserRe = exact('settings-menu-active-' + output.userId);
output.accountRe = exact('settings-menu-account-' + output.userId);
output.milestoneRe = exact('milestone-row-' + output.milestoneId);
output.assignmentRe = exact('chapter-row-' + output.assignmentId);
output.projectNameRe = exact(output.projectName);
output.milestoneNameRe = exact(output.milestoneName);
output.assignmentLabelRe = exact(output.assignmentLabel);
