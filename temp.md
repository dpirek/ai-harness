## Url

<https://genai-sharedservice-americas.pwcinternal.com/chat/completions>

## Method

POST

## Headers

```text
Authorization: Bearer sk-********************************
Content-Type: application/json
```

## PAYLOAD

```json
{
  "model": "azure.gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "Translate 'Hello world' to French."
    }
  ]
}
```