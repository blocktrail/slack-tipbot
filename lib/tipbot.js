var _ = require('lodash');
var debug = require('debug')('tipbot:tipbot');
var async = require('async');
var request = require('request');
var blocktrail = require('blocktrail-sdk');
var User = require('./user');
var Trigger = require('./trigger');

var TipBot = function(slack, BLOCKTRAIL_APIKEY, BLOCKTRAIL_APISECRET, SECRET, TESTNET, OPTIONS) {
    var self = this;

    self.slack = slack;
    self.client = blocktrail({
        apiKey: BLOCKTRAIL_APIKEY,
        apiSecret: BLOCKTRAIL_APISECRET,
        network: "BTC",
        testnet: TESTNET
    });
    self.explorerBaseUrl = "https://www.blocktrail.com/" + (TESTNET ? "tBTC" : "BTC");

    self.SECRET = SECRET;

    self.OPTIONS = _.defaults(OPTIONS, {
        ALL_BALANCES: false,
        DEMAND: false
    });

    self.users = {};
    self.triggers = [];
};

TipBot.prototype.addUser = function(user) {
    var self = this;

    self.users[user.id] = user;
    self.updateUserRegex();
};

/**
 * create a regex that matches any of the user IDs
 */
TipBot.prototype.updateUserRegex = function() {
    var self = this;

    var ids = _.reject(_.map(self.users, 'id'), function(id) {
        return id == self.slack.self.id;
    });
    var names = _.reject(_.map(self.users, 'name'), function(id) {
        return id == self.slack.self.name;
    });

    self.userRegex = new RegExp("(" + _.union(ids, names).join('|') + ")", "g");
};

TipBot.prototype.init = function() {
    var self = this;

    // get list of known users
    var url = 'https://slack.com/api/users.list?token=' + self.slack.token;
    request.get(url, function(err, response, body) {
        if (err) {
            debug('ERROR', err);
        }

        var data = JSON.parse(body);

        // add each user to our list of users
        _.each(data.members, function(member) {
            self.addUser(User.fromMember(self, member));
        });

        // init wallet for each user so we don't have to later
        async.forEach(Object.keys(self.users), function(userId, cb) {
            var user = self.users[userId];

            // call getWallet to init the wallet (will create if not exists)
            user.getWallet(function(wallet) {
                cb();
            })
        }, function() {
            debug('TipBot ready!');
            debug('We have the following known users; ', _.map(self.users, function(user) {
                return user.name;
            }).join(', '));
        });
    });
};

TipBot.prototype.normalizeValue = function(value, unit) {
    if (unit.match(/satoshis?/i)) {
        value = parseInt(value);
    } else if (unit.match(/BTC/i)) {
        value = blocktrail.toSatoshi(value);
    } else {
        value = null; // @TODO: should give a proper error
    }

    return value;
};

TipBot.prototype.tellHelp = function(channel) {
    channel.send(
        "*TIPBOT COMMANDS* \n" +
        " - *balance*\t\task the bot for your current balance; _@tipbot what is my balance_ \n" +
        " - *send*\t\t\t\ttell the bot to send coins to someone; _@tipbot send 0.1 BTC to @someone_ \n" +
        "\t\t\t\t\t\t\t_aliases: give_ \n" +
        " - *receive*\t\ttell the bot to request coins from to someone; _@tipbot receive 0.1 BTC from @someone_ \n" +
        "\t\t\t\t\t\t\t_aliases: demand, ask, deserve, get, give me, owes me_ \n" +
        " - *deposit*\t\task the bot for a deposit address; _@tipbot let me deposit!_ \n" +
        " - *withdraw*\ttell the bot to withdraw to a address; _@tipbot withdraw 1 BTC to 1dice8EMZmqKvrGE4Qc9bUFf9PX3xaYDp!_ \n"
    );
};

TipBot.prototype.onMessage = function(channel, member, message) {
    var self = this;

    var user = self.users[member.id];

    if (!user) {
        return;
    }

    if (user.id == self.slack.self.id) {
        return;
    }

    // debug message
    debug(channel.name, member.name, message);

    // check if we should parse this
    if (channel.is_channel && !message.match(self.slack.self.id) && !message.match(self.slack.self.name)) {
        debug('MESSAGE NOT FOR ME!');
        return;
    }

    // find user ID matches, ignore the sending user
    var userMatches = _.reject(message.match(self.userRegex), function(match) {
        return match == user.id || match == user.name;
    });

    // find real user objects
    userMatches = _.uniq(_.filter(_.map(userMatches, function(match) {
        // if it's an ID
        if (self.users[match]) {
            return self.users[match];
        }

        debug(match);

        // find user by name
        var user = _.find(self.users, function(user) {
            return user.name == match;
        });

        if (!user) {
            debug("Failed to find user match [" + match + "]");
        }

        return user;
    })));

    /*
     * ALL BALANCES
     */
    if (message.match(/(all|every(one)?s?) ?balance/i)) {
        if (!self.OPTIONS.ALL_BALANCES) {
            channel.send("Retrieving all balances is disabled!");

            return;
        }

        async.map(Object.keys(self.users), function(userID, cb) {
            var user = self.users[userID];

            user.getBalanceLine(cb);
        }, function(err, result) {
            if (err) {
                debug("ERROR", err);
                return;
            }

            channel.send(result.join("\n"));
        });

        return;
    }

    /*
     * BALANCE
     */
    if (message.match(/balance/i)) {
        if (channel.is_channel) {
            channel.send("I don't think you really want me to tell your balance public channel, " + user.handle + " :/");
        }

        user.tellBalance(self.slack.getDMByUserId(user.id));

        return;
    }

    /*
     * DEPOSIT
     */
    if (message.match(/deposit/i)) {
        user.tellDepositeAddress(self.slack.getDMByUserId(user.id));

        return;
    }

    /*
     * WITHDRAW
     */
    if (message.match(/withdraw/i)) {
        channel.send("Sorry " + user.handle + " you can't withdraw yet ...");

        return;
    }

    /*
     * MENTIONS ANOTHER USER
     */
    if (userMatches.length == 1) {
        var mentioned = userMatches[0];

        var amount = message.match(/(\d+\.?\d*) *(Satoshis?|BTC)/i), value;

        /*
         * DEMAND
         */
        var matches = message.match(/(ask|demand|deserve|receive|send ?me|give ?me|gimme|ow[en]?s? me)/i);
        if (amount && matches) {
            debug('REQUEST [' + matches[1] +  ']');
            if (!self.OPTIONS.DEMAND) {
                channel.send("Requesting coins is disabled!");

                return;
            }

            value = self.normalizeValue(amount[1], amount[2]);

            channel.send(mentioned.handle + ": " + user.handle + " is requesting " + blocktrail.toBTC(value) + " BTC from you ...");
            channel.send("Are you OK with that?");

            self.triggers.push(new Trigger(
                self,
                function(message, user, userMatches) {
                    var trigger = this;

                    if (user.id == mentioned.id && message.match(/(OK|yes|fine|sure)/i)) {
                        mentioned.send(channel, user, value);
                        trigger.destroy();

                        return true;
                    } else if (user.id == mentioned.id && message.match(/(no)/i)) {
                        trigger.destroy();

                        return true;
                    }

                    return false;
                },
                {
                    timeout: 600000 // 10min
                }
            ));

            return;
        }

        /*
         * SEND
         */
        if (amount && message.match(/(send|give|sent)/i)) {
            value = self.normalizeValue(amount[1], amount[2]);
            channel.send("OK! I'll send " + mentioned.handle + " " + blocktrail.toBTC(value) + " BTC");

            user.send(channel, mentioned, value);

            return;
        }
    }

    /*
     * TMP TRIGGERS
     */
    var triggers = self.triggers.slice();
    if (_.any(triggers, function(trigger) {
            return trigger.match(message, user, userMatches);
        })) {

        return;
    }

    /*
     * MENTIONS MULTIPLE USER
     */
    if (userMatches.length > 1) {
        channel.send("Sorry " + user.handle + " but you're mentioning too many people!");

        return;
    }

    /*
     * HELP
     */
    if (message.match(/help/i)) {
        self.tellHelp(channel);

        return;
    }

    /*
     * OOPS
     */
    channel.send("Sorry " + user.handle + " but I did not understand that :(");

    return;
};

module.exports = TipBot;
