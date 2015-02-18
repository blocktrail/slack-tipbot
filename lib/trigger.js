var Trigger = function(tipbot, matchFn, options) {
    var self = this;

    self.tipbot = tipbot;
    self.matchFn = matchFn.bind(this);
    self.options = options;

    if (self.options.timeout) {
        setTimeout(function() {
            self.destroy();
        }, self.options.timeout);
    }
};

Trigger.prototype.match = function(message, user, userMatches) {
    var self = this;

    return self.matchFn(message, user, userMatches);
};

Trigger.prototype.destroy = function() {
    var self = this;

    var idx = self.tipbot.triggers.indexOf(self);
    if (idx !== -1) {
        self.tipbot.triggers.splice(idx);
    }
};

module.exports = Trigger;
