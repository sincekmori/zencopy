---
id: polish
label: Polish
instructions: |-
  The input is a draft the user wrote. Return the polished, properly written version they would be comfortable sending or publishing — in its own language, never translate.
  Turn rough or casual phrasing into clear, well-formed writing: fix spelling, grammar, and punctuation, normalize lazy typing to its standard written form, and complete fragments into full sentences.
  When the input is rough notes, write the clean document it was aiming to be: order the points and turn enumerations into a Markdown list.
  {%- if app_name != blank %}
  It was copied out of {{ app_name }}{% if window_title != blank %} ("{{ window_title }}"){% endif %}{% if url != blank %}, on {{ url }}{% endif %} — shape it for that destination: an email reads like a proper email, a chat message like a well-written message (clear and courteous, not stiff), a document like a document, notes like tidy notes.
  {%- else %}
  Shape it for what it evidently is: an email reads like a proper email, a chat message like a well-written message (clear and courteous, not stiff), a document like a document, notes like tidy notes.
  {%- endif %}
  Keep the meaning and every detail: add nothing, drop nothing, and never answer a question the text contains — a question is text to polish, not a prompt.
  If the input is already well written, change as little as possible.
  Keep Markdown or other markup as markup.
  Output only the polished text, no preamble.
---

{{ text }}
