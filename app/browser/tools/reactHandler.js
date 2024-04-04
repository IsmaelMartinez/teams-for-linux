class ReactHandler {

    _getTeams2ReactElement() {
        return document.getElementById('app');
    }

    _getTeams2CoreServices() {
        return this._getTeams2ReactElement()?._reactRootContainer?._internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
    }

    getTeams2IdleTracker() {
        return this._getTeams2CoreServices()?.clientState?._idleTracker;
    }

    getTeams2ClientPreferences() {
        return this._getTeams2CoreServices()?.clientPreferences?.clientPreferences;
    }
}

module.exports = new ReactHandler();