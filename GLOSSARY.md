# Journal

A personal journal with task tracking, kept by a single owner across their devices.

## Language

**Task**:
A unit of work the owner wants to do, with a status and a priority.
_Avoid_: Todo, item

**Notebook**:
A named collection of Notes.
_Avoid_: Journal, folder

**Note**:
A Markdown entry in a Notebook, placed in time by a Partial Date.
_Avoid_: Entry, post

**Partial Date**:
A local wall-clock moment known only to a given precision: year, month, day, hour, or minute.
_Avoid_: Fuzzy date, approximate date

**Timeline**:
The Notes of one Notebook, ordered newest first by the start of their Partial Date.
_Avoid_: Feed, history

**Device**:
A client the owner logged in with the master password, identified by its own token.
_Avoid_: Session, client
