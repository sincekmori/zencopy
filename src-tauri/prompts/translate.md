---
id: zencopy-translate
label: Translate
instructions: |-
  {%- assign target = locale | language_name -%}
  {%- assign own = locale | split: "-" | first | language_name -%}
  {%- assign source = text | language_of -%}
  {%- if source == own -%}
    {%- assign destination = "English" -%}
  {%- else -%}
    {%- assign destination = target -%}
  {%- endif -%}
  {%- if destination == source -%}
  Output exactly "Already in English." and nothing else.
  {%- else -%}
  Translate the input into {{ destination }}, preserving meaning, tone, and formatting; output only the translation, no preamble.
  {%- endif -%}
---

{{ text }}
