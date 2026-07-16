<!-- SKILL -->
- changes to the plan document require regex. I believe regex based code is inherently brittle and we could perhaps come up with a way that stores programmatic state (like the task status) in another file? I want the plan to be a single source of truth and human readable so another file might defeat that purpose. need to brainstorm on how we can solve this.

- optimizing is severely needed. a lot of time is wasted in learning how to create the visual plan everytime. is this inevitable or can it be improved in some way?

- optimizing we can definitely perform....
    -> i think a lot of tokens are wasted in checking whether the vendor libs are available, what port to show the plan in (especially when using multi-sessions), etc. having a dedicated startup tool that: checks for all deps, starts a server on an unused port automatically and returns the port + then can add a command/tool to save the server pid when it starts and at the end of the planning session close it automatically? also configure a timeout so if the user forgets/exits out of the session abruptly, the server is killed after x seconds. this is just convenience though so we shouldn't aim for support for windows, linux, mac, etc. just basic and simple kill + kill w/ timeout support that we can add without complicating stuff.
    -> should have a script/fixed mechanism for clearing comments.json automatically after the plan is written so that older comments do not live on the updated plan.
    -> maybe its best to have a fixed workflow: explore -> brainstorm (within terminal) -> run a "start_plan" script (sets up plan skeleton/comments.json deterministically, starts server on first available port, returns port number (and saves it somewhere for teardown) ; token-efficient) -> write plan -> comments should only be made for simple updates. larger updates should be in a to-and-fro interactive manner with the agent within the terminal -> asking questions on unresolved comments -> rewrite updated plan (resolving all comments/turning comments into open questions) -> repeat until plan is approved -> plan approved -> end_plan (teardown server) -> final plan (merge the latest feedback for a single, immutable source of truth. if execution is stopped midway, then this doc contains all context and can be used standalone to resume) => execute

- divide into three skills that each need the visual part of this skill:
    -> only human-invocable
    -> /codevista plan  (two variants: one with brainstorming & one without)
    -> /codevista review (fold-in engineering/code-review from ~/skills/)
    -> external integrations: I think grill-with-docs, wayfinder, & improve-codebase-architecture all might benefit from pointing to codevista to create plans (or maybe its better if it is invoked by the human because it might help. NEED TO EXPLORE THE SKILLS BEFORE MAKING THESE CHANGES) 

<!-- IMPROVEMENTS: UI & FUNCTIONALITY -->
lavish-axi: similar tool but uses a lot of tokens. can integrate chat window and highlight to comment (like in antigravity plans) in the server itself.

<!-- CC ONLY -->
- using hooks when installed as a claude plugin I feel can also benefit from some claude code specific features.

- add background monitors for the server. In CC, it would fix the server killing/unexpected aliveness issues
