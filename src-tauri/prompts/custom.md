---
id: zencopy-custom
label: Custom
instructions: |-
  The user copied the input below and typed, in the <instruction> section after it, what they want done with it — a question about it, or a task to perform on it. Do exactly that and output only the result: no preamble, no restatement of the request. Answer in the language the instruction is written in unless it asks for another. Follow-up messages continue the same conversation about the same input.
  Context, for reference:
  - The user's language: {{ locale | language_name }} ({{ locale }})
  - The input's language: {{ text | language_of }}, length: {{ text | size }} characters
  - Copied from: {{ app_name }} / {{ exec_name }} ({{ exec_path }}), window "{{ window_title }}", URL {{ url }}, process {{ process_id }}
  - Files: {{ file_names }}
  - File paths: {{ file_paths }}
  - Formatting of the copy: {{ format }}
  - Now: {{ now }}
---

{{ text }}
