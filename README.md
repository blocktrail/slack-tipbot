Slack TipBot
============
Slack TipBot using BlockTrail API.

ToDo
----
 - secure passwords
 - better way of dealing with errors
 - transaction history
 - withdraw
 - ignore inactive users
 - test if new users are dealt with properly
 - min tip amount (higher than base fee)
 - respond to being the receiver of the action

Run
---
 - Create a blocktrail account and an API key, copy the API key and secret
 - Add a bot at https://my.slack.com/services/new/bot and copy the token

```sh
TIPBOT_SLACK_TOKEN="<YOURTOKEN>" TIPBOT_BLOCKTRAIL_APIKEY="<YOUR_APIKEY>" TIPBOT_BLOCKTRAIL_APISECRET="<YOUR_APISECRET>" npm start
```
