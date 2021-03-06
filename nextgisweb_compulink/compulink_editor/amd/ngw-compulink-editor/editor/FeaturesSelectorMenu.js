define([
    'dojo/_base/declare',
    'dojo/_base/array',
    'dojo/topic',
    'dijit/Menu',
    'dijit/MenuItem',
    'dijit/popup',
    'dijit/CheckedMenuItem',
    'dijit/MenuSeparator',
    'dijit/PopupMenuItem',
    'dojo/domReady!'
], function (declare, array, topic, Menu, MenuItem, popup, CheckedMenuItem,
             MenuSeparator, PopupMenuItem) {
    var FEATURE_TYPES = {
        'actual_real_special_transition': 'Спецпереход',
        'actual_real_special_transition_point': 'Отметка спецперехода',
        'actual_real_optical_cable': 'Трасса ВОЛС',
        'actual_real_optical_cable_point': 'Отметка трассы ВОЛС',
        'actual_real_fosc': 'Оптическая муфта',
        'actual_real_optical_cross': 'Оптический кросс',
        'actual_real_access_point': 'Точка доступа'
    };

    return declare([], {
        _menu: null,

        constructor: function (features) {
            var pMenu, label, menuItem;
            pMenu = new Menu({
                targetNodeIds: ['vectorIdentifyMarker']
            });

            array.forEach(features, function (feature) {
                if (feature.attributes.ngwFeatureId && feature.attributes.ngwLayerId) {
                    label = FEATURE_TYPES[feature.attributes.keyname] +
                        ': #' + feature.attributes.ngwFeatureId;
                    menuItem = new MenuItem({
                        label: label,
                        onClick: function () {
                            topic.publish('/compulink/editor/map/select', feature);
                        }
                    });
                    menuItem.feature = feature;
                    pMenu.addChild(menuItem);
                }
            }, this);

            pMenu.startup();

            pMenu._openMyself({
                target: document.getElementById('vectorIdentifyMarker')
            });

            this._menu = pMenu;
        },

        close: function () {
            popup.close(this._menu);
            this._menu.destroy();
            this._menu.destroyRecursive(true);
            this._menu.destroyRendering(true);
            this._menu = null;
        }
    });
});