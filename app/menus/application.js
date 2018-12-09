exports = module.exports = (Menus) => {
    return {
        label: 'Application',
        submenu: [
        
            {
                label: 'Open',
                accelerator: 'ctrl+O',
                click: () => Menus.open()
            },
            {
                label: 'Refresh',
                accelerator: 'ctrl+R',
                click: () => Menus.reload()
            },
            {
                label: 'Quit',
                accelerator: 'ctrl+Q',
                click: () => Menus.quit()
            }
        ]
    };
        
};