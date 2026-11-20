# Agent Ofisi

**A live 3D office for your Claude Code agents.** 11 workers, one manager, a shared task board, and a room where you can watch who is doing what.

![Agent Ofisi](docs/office.png)

[Azərbaycanca](README.az.md)

## What it does

- **Team of agents.** Text, design, video, research, code, review and license checks. Each worker hands its result to the next one automatically.
- **Live 3D office.** See who is working, waiting or idle, and watch tasks move between desks.
- **Task board.** Click a worker and give it a task, or just write in chat: `Kadr, make a 15-second Reels`.
- **Day and night shifts.** Say `start the morning shift`. The manager hands out tasks every 15 minutes and writes a report when the shift ends.
- **Safe by default.** No paid steps, no downloads, nothing posted for you and no deploys without your "yes".

## Install

You need [Claude Code](https://claude.com/claude-code) and Node 18+. There is nothing else to install: no `npm install` and no API keys.

```sh
git clone https://github.com/Fexreddin-dev/agent-ofisi
cd agent-ofisi
node install.js
```

1. Open the office: double-click `Ofis.bat` (Windows) or run `./ofis.sh` (macOS/Linux). It opens at http://127.0.0.1:8770.
2. Open Claude Code in this folder. That chat is **Atlas**, the manager.
3. Write a task, for example `Qapıçı, check the license of Kokoro TTS`.

## The team

| | | | |
|---|---|---|---|
| **Atlas**, manager | **Qələm**, copywriter | **Palitra**, designer | **Kadr**, video |
| **Puls**, social media plan | **Kəşfiyyatçı**, research | **Qapıçı**, license & budget | **Vizor**, quality check |
| **Memar**, website code | **Münsif**, website review | **Nova**, ML models | **Lumen**, model review Lab |

## Good to know

- The UI and the agents speak **Azerbaijani**. To switch, change the language line in `QAYDALAR.md` and `agents/*.md`.
- Memar and Münsif get better with a website-building skill and a website-review skill in `~/.claude/skills/`. They are not included here, so use your own.
- Everything stays on your computer. The office only listens on 127.0.0.1, and `data/` and `out/` never leave your machine.
- Uninstall with `node install.js --uninstall`. Your files stay.

MIT License
