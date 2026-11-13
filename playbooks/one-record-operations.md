# One Record: Running An Engagement With An AI Assistant

How I keep a network and security engagement in a state where any engineer, or any AI assistant, can pick up the work tomorrow without me in the room.

## Problem

A ship keeps a log. Whoever takes the watch reads the log, not the memory of the last officer. If the log is current, the ship keeps its course through any change of crew.

AI assistants make this sharper. A chat forgets. A different assistant knows nothing. If the state of the work lives in a conversation, it is lost the day the tool, the subscription or the person changes.

## Environment

Vendor neutral. A knowledge base served over the Model Context Protocol (MCP), a separate knowledge base per client, reachable from any assistant that speaks MCP. A human engineer runs everything that touches the network.

## What Worked

### One Record

| Piece | Holds | Rule |
|---|---|---|
| Rules file | How work is done on this engagement | One copy. Other places point to it |
| Brief | A map and the facts that do not change weekly | Loaded first in every session |
| Tracker | Status, tasks, decisions | Exactly one. Never a second list |
| Board | This week, promises with due dates, decisions with defaults, who is waited on, recent requests | A view of the tracker, updated with it |
| Facts of record | Dated, verified facts | Each line carries its verification date and source, or the word UNVERIFIED |
| Lessons | Root causes and gotchas | One line each, dated |
| Scripts and run folders | The work itself and its evidence | Named per build, numbered per run |

### The Loop

1. Read the record before answering: brief, board, the tracker row, the facts, the files the task rests on.
2. Checks first, then fixes, then messages and documents.
3. Prove every "done" in the same reply: the verify line, a read-back, the version a write returned.
4. Write the record in the same reply that changed something. Nothing waits for an end of session, because nobody can say when a session ends.

### Sources, In Order

1. Live evidence from the device or controller.
2. Dated facts of record.
3. Other documents of record; the newest reconciliation wins.
4. Vendor documentation for the exact running version.
5. General knowledge, labelled as such.

Documentation is a hypothesis; the live device decides. Check which device you are on. A value that can drift is stated with its file, its date and the command that confirms it.

### Who Does What

| Step | Assistant | Engineer | Client |
|---|---|---|---|
| Read the record, draft scripts, plans, messages | Does | Reviews what goes out | |
| Run anything on the network | Never | Does | |
| Send a message | Never | Does | Approves external ones |
| Approve a change window | | Asks | Decides |
| Update the record | Does, same reply | | |

### What Needs No Permission

Read-only checks, exports, drafts, scripts, plans and record updates. Work already agreed with the client is not sent back for confirmation. An unclear request gets the most reasonable reading, stated in one line.

The stops are few and named: sending in someone's name, an irreversible production step nobody asked for, and the devices on the guarded list.

### Decisions Never Block

Every open decision is written with an owner and a default. If nobody answers, the default applies and the record says so.

### Handoff

A handoff that let a colleague continue had these parts:

1. Title with the state time.
2. The source line: anything not listed here was not done.
3. Rules for every track: first reads, where scripts go, the sending gate.
4. Per track: what to read, what is done with its evidence, the next command and the line it should print, what was not done, limits, open questions with defaults.
5. Drafts waiting to be sent.

"Who did what" is answered from the knowledge base's own version history and access log, never from what a document says.

### Any Assistant Can Start

One paragraph is enough to start a new assistant cold: call the brief, read the rules file, read the board, search before any factual answer, write back with version checks, never store a secret. Rules that name tools the assistant does not have are followed without the tool name.

### Second Opinions

For work where a wrong answer is expensive, a fresh checker that saw none of the work receives the output and the sources, and is asked to break it. Splitting work across parallel assistants is used when it buys accuracy or when a piece is large. It is never used just to go faster, because each helper has to read its way in before it does any work.

## Why

One record removes the two questions that eat a handover: "what is the state" and "can I trust it". Version checks on every write let two people and their assistants work in the same record without overwriting each other. Defaults on decisions keep work moving while people are busy.

## Gotchas

- In my experience, automatic summaries of a record sometimes report open work as done. They are leads, never sources.
- A second copy of a rule drifts within weeks. Keep one and point to it.
- A record that only grows becomes too large to read at the start of a session. Fold and archive on a schedule.
- Promises without a due date are not tracked. Promises with one show up late, which is the point.
- Secrets never enter the record. The record says where a credential lives, never what it is.

## Verify

Hand the brief, the rules file and the board to an assistant with no history. Ask it what is in progress, what is waiting on whom, and what the next command is. If it answers correctly, that is evidence the record works. If it cannot, fix the record, not the assistant.
