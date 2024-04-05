class ReactHandler {
    getTeams2IdleTracker() {
        const teams2CoreServices = this._getTeams2CoreServices();
        return teams2CoreServices?.clientState?._idleTracker;
    }

    getTeams2ClientPreferences() {
        const teams2CoreServices = this._getTeams2CoreServices();
        return teams2CoreServices?.clientPreferences?.clientPreferences;
    }

    _getTeams2ReactElement() {
        return document.getElementById('app');
    }

    _getTeams2CoreServices() {
        const reactElement = this._getTeams2ReactElement();
        return reactElement?._reactRootContainer?._internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
    }
}

module.exports = new ReactHandler();