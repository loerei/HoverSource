---
"hoversource": patch
---

Prevent `$HOME` `.hoversourcerc` from overriding active named presets as a pseudo-local repo config, guard `$HOME` local writes/deletes, and suppress expected `ECONNREFUSED` CDP target query logs when no browser debug target is listening.
