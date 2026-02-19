# Project Conventions

## Verification

Run `just check` regularly to verify the project builds and passes checks.

## Lucide Icons (lucide-solid)

Always use deep imports for lucide-solid icons:

```ts
// Correct
import FileText from "lucide-solid/icons/file-text";

// Wrong — do NOT use barrel imports
import { FileText } from "lucide-solid";
```

## Security: innerHTML

If you use `innerHTML` (or SolidJS's `innerHTML` directive), always sanitize the content first (e.g. with DOMPurify) to prevent XSS.
