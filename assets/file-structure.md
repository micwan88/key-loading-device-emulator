# Project File Structure

```

Project Folder
├── CLAUDE.md
├── .claude/rules/                ← claude code project rules
│   └── xxxx
├── tasks/
│   ├── story-1-r1-template.md    ← request template
│   ├── story-{id}-r{rev}.md      ← request with `unique ID` and `revision` from user
│   ├── xxxx-plan-{id}-r{rev}.md  ← work plan correspond to `unique ID + revision` request
│   ├── xxxx-note.md              ← lessons capture by agent
│   ├── ...
│   └── archived/                 ← archive folder for tasks related files
├── assets/                       ← static project files
│   ├── file-structure.md         ← project file structure
│   ├── sop.md                    ← project sop
│   └── ...
├── src/                          ← codebase files
│   └── ...
├── index.html                    ← landing page
└── xxxxx                         ← other project file (LICENSE, README, ... etc)

```