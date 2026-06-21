---
name: manage-custom-skills
description: >
  Create, update, and distribute custom agent skills. Scaffolds new skill folders or updates existing ones,
  registers them in the skill installer script, and syncs them across all project workspaces. Use when the 
  user wants to create, edit, update, or manage custom skills.
---

# Manage Custom Skills

This skill guides the agent through building or updating custom skills, registering them with the global setup, and distributing them to all project workspaces.

---

## 1. Gather Requirements

Ask the user:
1. What is the name of the new or existing skill? (e.g. `my-awesome-skill`)
2. What does it do? (for the YAML description block)
3. Under what conditions should the agent trigger it? (triggers)
4. What instructions, guidelines, and commands should be included?

---

## 2. Scaffold Global Skill

Create a new directory and write the `SKILL.md` file globally:
Path: `C:\Users\sayus\.gemini\.agents\skills\<skill-name>\SKILL.md`

Ensure it contains the correct YAML frontmatter:
```yaml
---
name: <skill-name>
description: >
  <One sentence on what it does>. Use when [specific triggers].
---
```

---

## 3. Register & Distribute

Update the skill installer script [install-skills.js](file:///D:/Projects/install-skills.js) to add the new skill to the distribution list:

```javascript
const CUSTOM_SKILLS = [
  'initialize-knowledge-graph',
  'sonarqube-workflow',
  'manage-custom-skills',
  '<new-skill-name>'
];
```

Run the distribution script:
```powershell
node D:\Projects\install-skills.js
```
Confirm to the user that the skill has been created/updated and synced.

---

## 4. Updating & Redistributing Existing Skills

When editing or updating an existing custom skill:
1. **Apply changes globally first**: Always copy the updated files from the local workspace to the global customizations root directory: `C:\Users\sayus\.gemini\.agents\skills\<skill-name>\`
2. **Redistribute**: Run the installer script to sync the updates across all project workspaces:
   ```powershell
   node D:\Projects\install-skills.js
   ```
