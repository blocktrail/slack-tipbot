Slack TipBot
============
Slack TipBot using BlockTrail API.

ToDo
----
 - better way of dealing with errors
 - transaction history
 - withdraw
 - think of a way to deal with deleted users with BTC balance
 - respond to being the receiver of the action

Run
---
 - Create a blocktrail account and an API key, copy the API key and secret
 - Add a bot at https://my.slack.com/services/new/bot and copy the token

```sh
TIPBOT_SLACK_TOKEN="<YOURTOKEN>" TIPBOT_BLOCKTRAIL_APIKEY="<YOUR_APIKEY>" TIPBOT_BLOCKTRAIL_APISECRET="<YOUR_APISECRET>" npm start
```
