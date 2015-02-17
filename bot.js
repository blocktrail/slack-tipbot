var _ = require('lodash');
var debug = require('debug')('tipbot:bot');
var Slack = require('slack-client');
var TipBot = require('./lib/tipbot');
var assert = require('assert');

assert(process.env.TIPBOT_SLACK_TOKEN, "TIPBOT_SLACK_TOKEN is required");
assert(process.env.TIPBOT_BLOCKTRAIL_APIKEY, "TIPBOT_BLOCKTRAIL_APIKEY is required");
assert(process.env.TIPBOT_BLOCKTRAIL_APISECRET, "TIPBOT_BLOCKTRAIL_APISECRET is required");
assert(process.env.TIPBOT_SECRET, "TIPBOT_SECRET is required");

var SLACK_TOKEN = process.env.TIPBOT_SLACK_TOKEN,
    BLOCKTRAIL_APIKEY = process.env.TIPBOT_BLOCKTRAIL_APIKEY,
    BLOCKTRAIL_APISECRET = process.env.TIPBOT_BLOCKTRAIL_APISECRET,
    SECRET = process.env.TIPBOT_SECRET,
    TESTNET = true,
    AUTO_RECONNECT = true,
    OPTIONS = {ALL_BALANCES: true, DEMAND: true};

/**
 * find a DM channel object by userID
 *
 * @param userId
 * @returns {*}
 */
Slack.prototype.getDMByUserId = function(userId) {
    return _.find(this.dms, {user: userId});
};

var slack = new Slack(SLACK_TOKEN, AUTO_RECONNECT, /* AUTO_MARK */ true);
var tipbot = new TipBot(slack, BLOCKTRAIL_APIKEY, BLOCKTRAIL_APISECRET, SECRET, TESTNET, OPTIONS);

slack.on('open', function() {
    var channels = [],
        groups = [];

    _.each(slack.channels, function(channel, key) {
        if (channel.is_member) {
            channels.push('#' + channel.name);
        }
    });

    _.each(slack.groups, function(group, key) {
        if (group.is_open && !group.is_archived) {
            groups.push(group.name);
        }
    });

    debug('Connected to Slack. You are @%s of %s', slack.self.name, slack.team.name);
    debug('You are in (channels): %s', channels.join(', '));
    debug('As well as (groups): %s', groups.join(', '));

    // init the tipbot
    tipbot.init();
});

slack.on('message', function(message) {
    debug('MESSAGE', message.type, message.channel, message.user, message.text);

    var type = message.type,
        channel = slack.getChannelGroupOrDMByID(message.channel),
        member = slack.getUserByID(message.user);

    // Respond to messages with the reverse of the text received.
    if (type === 'message') {
        // random stuff we can safely ignore
        if (!message.text || !member) {
            return;
        }

        // let tipbot handle the message
        tipbot.onMessage(channel, member, message.text);
    }
});

slack.on('userChange', function(u) {
    tipbot.onUserChange(u);
});

slack.on('error', function(error) {
    debug('Error: %s', error);
});

slack.login();
