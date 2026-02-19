# Data Pipeline

The data pipeline converts raw documents (docx, pdf, pptx, xls, xlsx) into markdown for the agent to consume. All pipeline functions are server-only.

## Location

`src/lib/dataCleaning/convert_to_markdown.ts`

## Functions

### `read_document(path)`

Entry point. Reads a file from disk and returns its content as a string:

1. Detects actual file type from magic bytes (warns if extension mismatches)
2. If the file is a supported format (docx, pdf, pptx, xls, xlsx), converts to markdown
3. Otherwise reads as plain text

### `convert_to_markdown(source, options?)`

Converts a document file to markdown using the [MarkItDown](https://github.com/microsoft/markitdown) library (TypeScript port). Formats the output with Prettier's markdown parser unless `skip_format: true`.

Supported formats:

| Extension | Format                |
|-----------|-----------------------|
| `.docx`   | Word document         |
| `.pdf`    | PDF                   |
| `.pptx`   | PowerPoint            |
| `.xls`    | Excel (legacy)        |
| `.xlsx`   | Excel                 |

### `get_raw_doc_path()`

Reads the `RAW_DOC_PATH` environment variable. Throws if unset.

## Dependencies

| Package         | Purpose                         |
|-----------------|---------------------------------|
| `markitdown-ts` | Document-to-markdown conversion |
| `file-type`     | Magic byte detection            |
| `prettier`      | Markdown formatting             |

## Aliases

Both `snake_case` and `camelCase` exports exist:

```ts
export const readDocument = read_document;
export const convertToMarkdown = convert_to_markdown;
export const getRawDocPath = get_raw_doc_path;
```
