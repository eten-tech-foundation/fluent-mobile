## 🔥 TLDR
<!-- One sentence summary: What was broken/needed and how you fixed it -->


## 📋 Summary
- **Issue**: <!-- What problem were you solving? -->
- **Root Cause**: <!-- What was causing the issue? -->
- **Solution**: <!-- How did you fix it? -->
- **Impact**: <!-- What's the positive outcome? -->

**Related Issue:** <!-- Link to Linear ticket/issue -->

**Type of Change:**
- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality) 
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🔧 Maintenance/refactor (no functional changes)

### Acceptance criteria
<!-- See AGENTS.md — done means ticket AC, not green CI alone -->
- [ ] All ticket acceptance criteria met, **or** unmet AC waived **in the ticket** with linked follow-up issues
- [ ] No “known limitations” in this PR body without a ticket-level waiver + follow-up link

---

## 🔧 Technical Changes

### Key Files Modified
<!-- List the main files changed and what was changed -->

**`filename.tsx`**
```tsx
// Show key code changes with before/after if helpful
- // Old code that was problematic
+ // New improved code
```

**Lines changed**: ~X lines modified | **Files modified**: X

### Dependencies & Configuration
- [ ] No new dependencies
- [ ] New dependencies: <!-- List any new packages -->
- [ ] No config changes  
- [ ] Environment/build config changes: <!-- Describe -->
- [ ] No database changes
- [ ] Database/storage changes: <!-- Describe with migration info -->

### Scope
<!-- See AGENTS.md — one ticket = one PR -->
- [ ] Changes are limited to this ticket; no adjacent tickets implemented or stubbed without approval

---

## ✅ Testing & Quality Checklist

### Testing Completed
- [ ] Android device tested (REQUIRED for native / mic / camera / filesystem / permissions changes — do **not** check unless verified on a device; see `AGENTS.md`)
- [ ] ✅ Unit tests added/updated and passing
- [ ] ✅ Edge cases considered and tested

### Code Quality (fluent-mobile gates)
- [ ] ✅ `npm run lint`
- [ ] ✅ `npm run format:check`
- [ ] ✅ `npm run typecheck`
- [ ] ✅ `npm test -- --ci`
- [ ] ✅ Self-reviewed the code changes

---

## 📸 Screenshots/Recordings
<!-- Add screenshots for UI changes or screen recordings for interactions -->


---

## 🎯 Why This Solution?
<!-- Explain why you chose this approach over alternatives -->
1. **Reason 1**: <!-- Key benefit or requirement addressed -->
2. **Reason 2**: <!-- Technical or business justification -->
3. **Reason 3**: <!-- Long-term maintainability or performance benefit -->

## 📱 Before/After
- **Before**: <!-- What was the previous behavior/state? -->
- **After**: <!-- What's the new behavior/state? -->

---

## ⚠️ Breaking Changes
<!-- List any breaking changes and migration instructions -->
- [ ] No breaking changes
- [ ] Breaking changes documented below:


---

## 📊 Performance Impact
<!-- Assess performance implications -->

**Bundle Size:** <!-- Impact on app size -->
- [ ] No significant impact (< 1MB)
- [ ] Minor increase (1-5MB) 
- [ ] Significant increase (> 5MB) - justified because:

**Runtime Performance:**
- [ ] No performance impact
- [ ] Performance improvements
- [ ] Potential performance concern - mitigated by:

**Battery/Memory:**
- [ ] No impact on battery or memory usage
- [ ] Optimizations that improve battery/memory
- [ ] Potential impact - acceptable because:

---

## 🧪 How to Test
<!-- Step-by-step instructions for reviewers -->

**Prerequisites:** Node 24+, `npm install`, copy `.env.example` → `.env`, Metro + `npm run android`

**Steps:**
1. <!-- Step 1 -->
2. <!-- Step 2 -->  
3. <!-- Step 3 -->

**Expected:** <!-- What reviewers should verify -->

---

## 🔗 Additional Context
<!-- Any additional information that reviewers should know -->


**Deployment Notes:** <!-- Special deployment considerations -->


**Follow-up Tasks:** <!-- Deferred AC must link to follow-up issues (ticket-level waiver required; see AGENTS.md) -->
- [ ] <!-- e.g. #NNN — deferred AC description -->
- [ ] <!-- Future task 2 -->
