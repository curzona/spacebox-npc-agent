This is where I'll keep the npc scripts for spacebox. There will also be
some player bots in here.

Ask Jordan for creds and the url to the staging instance and you can connect the
agent script to that instance and then you can start customizing your agent.

agent.js is the script currently running on the staging site. I put `SPODB_URL`
and `INTERNAL_CREDS` in a env file and then run:

```
forego run -e staging.env node arena.js
```
