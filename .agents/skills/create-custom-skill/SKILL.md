---
name: create-custom-skill
description: >
  Create and distribute new custom agent skills. Scaffolds a new skill folder with SKILL.md 
  in the global .gemini directory, registers it in the skill installer script, and syncs 
  it across all project workspaces. Use when the user wants to create, add, or build a new custom skill.
---

# Create Custom Skill

This skill guides the agent through building a new custom skill, registering it with the global setup, and distributing it to all project workspaces.

---

## 1. Gather Requirements

Ask the user:
1. What is the name of the new skill? (e.g. `my-awesome-skill`)
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
  'create-custom-skill',
  '<new-skill-name>'
];
```

Run the distribution script:
```powershell
node D:\Projects\install-skills.js
```
Confirm to the user that the skill has been created and synced.
