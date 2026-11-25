# Questions about the SPEC

When an agent hits a place where the SPEC is missing behaviour, it **writes it here, does not guess**, then works on another part. The owner answers in the spec session, edits `SPEC.md`, and only then does the build of that part continue.

This open edition starts with an empty ledger. Comments in the code like "`spec-questions.md` #116" point to the questions ledger of the original build, which does not ship with this repo; the answers are already in `SPEC.md` (mostly in section 19.12).

Record each question using this template:

```
## #<number> · <SPEC section>
- What is missing: <which situation the SPEC says nothing about>
- Provisional proposal: <the safer direction, without changing scope>
- Which piece of work it blocks: <…>
- Owner's answer: <leave empty until the owner answers>
```
