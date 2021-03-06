/*global console, OpenLayers*/
define([
    "dojo/_base/declare",
    "ngw-webmap/tool/Base",
    "dojo/_base/lang",
    "dojo/_base/array",
    "dojo/Deferred",
    "dojo/promise/all",
    "dojo/json",
    "dojo/request/xhr",
    "dojo/dom",
    "dojo/dom-class",
    "dojo/dom-style",
    "dojo/on",
    "dijit/Dialog",
    "dijit/layout/BorderContainer",
    "dijit/layout/ContentPane",
    "dijit/layout/StackContainer",
    "dijit/layout/StackController",
    "dijit/form/Select",
    "dijit/form/Button",
    "dijit/layout/TabContainer",
    "dijit/registry",
    "put-selector/put",
    "ngw/route",
    "ngw/openlayers",
    "ngw/openlayers/Popup",
    "./FieldsDisplayWidget",
    "./FeatureEditorWidget",
    // settings
    "ngw/settings!feature_layer",
    "ngw/settings!webmap",
    // css
    "xstyle/css!./resource/Identify.css",
    "ngw-compulink-site/tool/attachments/FotoDisplayWidget",
    "ngw-compulink-site/tool/attachments/DocDisplayWidget"
], function (declare,
             Base,
             lang,
             array,
             Deferred,
             all,
             json,
             xhr,
             dom,
             domClass,
             domStyle,
             on,
             Dialog,
             BorderContainer,
             ContentPane,
             StackContainer,
             StackController,
             Select,
             Button,
             TabContainer,
             registry,
             put,
             route,
             openlayers,
             Popup,
             FieldsDisplayWidget,
             FeatureEditorWidget,
             featureLayersettings,
             webmapSettings) {
    var Control = OpenLayers.Class(OpenLayers.Control, {
        initialize: function (options) {
            OpenLayers.Control.prototype.initialize.apply(this, [options]);

            this.handler = new OpenLayers.Handler.Click(this, {
                click: this.clickCallback
            });
        },

        clickCallback: function (evt) {
            this.tool.execute([evt.xy.x, evt.xy.y]);
        }
    });

    var Widget = declare([BorderContainer], {
        style: "width: 100%; height: 100%",
        gutters: false,

        postCreate: function () {
            this.inherited(arguments);

            this.selectOptions = [];

            var layersOrdered = this._getLayersOrdered(),
                layerId, layerOrderedItem, layerResponse, idx;

            for (var i = 0, layersCount = layersOrdered.length; i < layersCount; i++) {
                layerOrderedItem = layersOrdered[i];
                layerId = layerOrderedItem.id;
                layerResponse = this.response[layerId];
                idx = 0;

                array.forEach(layerResponse.features, function (feature) {
                    var label = put("div[style=\"overflow: hidden; display: inline-block; text-align: left;\"] $ span[style=\"color: gray\"] $ <",
                        layerOrderedItem.layerName + ': ',
                        (feature.label || "#" + feature.id),
                        " (" + feature.parent + ")");
                    domStyle.set(label, "width", (this.popupSize[0] - 30) + "px");
                    this.selectOptions.push({
                        label: label.outerHTML,
                        value: layerId + "/" + idx
                    });
                    idx++;

                    feature.layerType = layerOrderedItem.lt;

                }, this);
            }

            this.selectPane = new BorderContainer({
                region: "top", layoutPriority: 1,
                design: "sidebar",
                style: "padding: 0; height: 26px; margin: 1px;"
            });
            this.addChild(this.selectPane, "ngwWebmapToolIdentify-controller");

            this.select = new Select({
                options: this.selectOptions,
                id: "featureSelector",
                style: "width: 100%; height: 24px;",
                region: "center"
            }).placeAt(this.selectPane);

            // создаем виждеты для всех расширений IFeatureLayer
            var deferreds = [];
            var widget = this;

            widget.extWidgetClasses = {};

            array.forEach(Object.keys(featureLayersettings.extensions), function (key) {
                var ext = featureLayersettings.extensions[key];

                if (key == "attachment") {
                    ext = "ngw-compulink-site/tool/attachments/FotoDisplayWidget";
                    var deferred = new Deferred();
                    deferreds.push(deferred);

                    require([ext], function (cls) {
                        widget.extWidgetClasses["foto_attache"] = cls;
                        deferred.resolve(widget);
                    });

                    ext = "ngw-compulink-site/tool/attachments/DocDisplayWidget";
                    deferred = new Deferred();
                    deferreds.push(deferred);

                    require([ext], function (cls) {
                        widget.extWidgetClasses["doc_attache"] = cls;
                        deferred.resolve(widget);
                    });

                }
                else {
                    var deferred = new Deferred();
                    deferreds.push(deferred);

                    require([ext], function (cls) {
                        widget.extWidgetClasses[key] = cls;
                        deferred.resolve(widget);
                    });
                }
            }, this);

            this.extWidgetClassesDeferred = all(deferreds);
        },

        _getLayersOrdered: function () {
            var layersOrdered = [],
                layersByVectorId = this.layersManager.LayersByVectorId,
                layer, vector_id;

            for (vector_id in layersByVectorId) {
                if (layersByVectorId.hasOwnProperty(vector_id)) {
                    layer = layersByVectorId[vector_id];
                    layersOrdered.push({
                        id: vector_id,
                        z: this.layersManager.LayersConfig[layer.layer_type].order,
                        lt: layer.layer_type,
                        layerName: this.layersManager.LayersConfig[layer.layer_type].identify_text
                    });
                }
            }

            layersOrdered.sort(function (a, b) {
                return b.z - a.z;
            });

            return layersOrdered;
        },

        startup: function () {
            this.inherited(arguments);

            var widget = this;

            this.select.watch("value", function (attr, oldVal, newVal) {
                widget._displayFeature(widget._featureResponse(newVal));
            });
            this._displayFeature(this._featureResponse(this.select.get("value")));
        },

        _featureResponse: function (selectValue) {
            var keys = selectValue.split("/");
            return this.response[keys[0]].features[keys[1]];
        },

        _displayFeature: function (feature) {
            var widget = this,
                layerId = feature.layerId,
                layerType = feature.layerType,
                featureId = feature.id,
                getFeatureInfo;

            getFeatureInfo = route.feature_layer.feature.item({id: layerId, fid: featureId});

            xhr.get(getFeatureInfo, {
                method: "GET",
                handleAs: "json"
            }).then(function (feature) {
                widget.extWidgetClassesDeferred.then(function () {
                    if (widget.featureContainer) {
                        widget.featureContainer.destroyRecursive();
                    }

                    widget.featureContainer = new BorderContainer({region: "center", gutters: false});
                    widget.addChild(widget.featureContainer);

                    widget.extContainer = new TabContainer({
                        region: "center", class: "ngwWebmapToolIdentify-tabContainer"
                    });

                    widget.featureContainer.addChild(widget.extContainer);

                    //widget.extController = new StackController({
                    //    region: "top", layoutPriority: 2,
                    //    containerId: widget.extContainer.id
                    //});
                    //domClass.add(widget.extController.domNode, "ngwWebmapToolIdentify-controller");

                    //widget.featureContainer.addChild(widget.extController);

                    // Показываем виджет с атрибутами в том случае, если
                    // это не отключено в настройках
                    if (featureLayersettings.identify.attributes) {
                        var fwidget = new FieldsDisplayWidget({
                            resourceId: layerId,
                            layerType: layerType,
                            featureId: featureId,
                            compact: true,
                            aliases: true, grid_visibility: true
                        });

                        fwidget.renderValue(feature.fields);

                        var fw_wrapper = new ContentPane({
                            title: "Атрибуты",
                            style: "margin: 0px; padding: 0px"
                        });
                        fw_wrapper.addChild(fwidget);

                        fw_wrapper.placeAt(widget.extContainer);
                    }

                    array.forEach(Object.keys(widget.extWidgetClasses), function (key) {

                        ext_key = key;
                        if (key == "foto_attache" || key == "doc_attache") {
                            ext_key = "attachment";
                        }
                        var cls = widget.extWidgetClasses[key];
                        var ewidget = new cls({
                            resourceId: layerId,
                            featureId: featureId,
                            compact: true
                        });

                        ewidget.renderValue(feature.extensions[ext_key]);
                        ewidget.placeAt(widget.extContainer);
                    });


                    setTimeout(function () {
                        widget.resize();
                    }, 10);

                }).otherwise(console.error);
            }).otherwise(console.error);
        }
    });

    var layersTypesById = {};
    function parseLayersInfo (layersInfo) {
        if (layersInfo.constructor !== Array) return false;
        array.forEach(layersInfo, function (layersInfoItem) {
            if (layersInfoItem.children) {
                parseLayersInfo(layersInfoItem.children)
            } else {
                layersTypesById[layersInfoItem.id] = layersInfoItem;
            }
        });
    }

    var identifyIconLoading = new OpenLayers.Icon(
            ngwConfig.compulinkAssetUrl + 'img/identify-loading.svg',
            new OpenLayers.Size(40,40)),
        isIdentifyActive = false,
        identifyLoadingMarker,
        identifyIcon = new OpenLayers.Icon(
            ngwConfig.compulinkAssetUrl + 'img/identify-icon.png',
            new OpenLayers.Size(16,16)),
        identifyMarker = null,
        identifyLayerName = 'identifyMarkers',
        identifyLayer = new OpenLayers.Layer.Markers(identifyLayerName);

    return declare(Base, {
        label: "Информация об объекте",
        iconClass: "iconIdentify",

        // Радиус для поиска объектов в пикселях
        pixelRadius: webmapSettings.identify_radius,

        // Ширина popup
        popupWidth: webmapSettings.popup_width,

        // Высота popup,
        popupHeight: webmapSettings.popup_height,

        constructor: function () {
            this.map = this.display.map;
            this.layersManager = this.display.LayersManager;

            this.control = new Control({tool: this});
            this.display.map.olMap.addControl(this.control);
        },

        activate: function () {
            this.control.activate();
        },

        deactivate: function () {
            this.control.deactivate();

            if (this.popup) {
                this.display.map.olMap.removePopup(this.popup);
                this.popup = null;
            }
        },

        execute: function (pixel) {
            var tool = this,
                olMap = this.display.map.olMap,
                point = olMap.getLonLatFromPixel(new OpenLayers.Pixel(pixel[0], pixel[1])),
                vectors_ids = [];

            var request = {
                srs: 3857,
                geom: this._requestGeomString(pixel),
                layers: []
            };

            isIdentifyActive = true;
            this._addIdentifyLayer();
            identifyLoadingMarker = new OpenLayers.Marker(point, identifyIconLoading);
            identifyLayer.addMarker(identifyLoadingMarker);

            for (var lyr_name in this.display.map.layers) {
                var lyr = this.display.map.layers[lyr_name];
                if (lyr.vectors_ids) {
                    vectors_ids = lyr.vectors_ids.split(',');
                    array.forEach(vectors_ids, function (vector_id, index) {
                        request.layers.push(vector_id);
                    }, this);
                }
            }

            var layerLabels = {};
            array.forEach(request.layers, function (i) {
                layerLabels[i] = i;
            }, this);

            xhr.post(route("feature_layer.identify"), {
                handleAs: "json",
                data: json.stringify(request)
            }).then(function (response) {
                isIdentifyActive = false;
                identifyLayer.removeMarker(identifyLoadingMarker);
                tool._responsePopup(response, point, layerLabels);
            }, lang.hitch(this, function (err) {
                console.log(err);
                isIdentifyActive = false;
                this._clearIdentifyLayer();
            }));
        },

        // WKT-строка геометрии поиска объектов для точки pixel
        _requestGeomString: function (pixel) {
            var olMap = this.map.olMap,
                bounds = new openlayers.Bounds();

            bounds.extend(olMap.getLonLatFromPixel({x: pixel[0] - this.pixelRadius, y: pixel[1] - this.pixelRadius}));
            bounds.extend(olMap.getLonLatFromPixel({x: pixel[0] + this.pixelRadius, y: pixel[1] + this.pixelRadius}));

            return bounds.toGeometry().toString();
        },

        _removePopup: function () {
            if (this._popup) {
                this._popup.widget.select.closeDropDown(true);
                this._popup.widget.destroyRecursive();
                this.map.olMap.removePopup(this._popup);
                this._popup = null;
            }
            if (identifyMarker) {
                identifyLayer.removeMarker(identifyMarker);
                identifyMarker = null;
            }
        },

        _responsePopup: function (response, point, layerLabels) {
            this._removePopup();

            if (!response.featureCount || response.featureCount === 0) {
                this._clearIdentifyLayer();
                return false;
            }

            this._addIdentifyLayer();
            identifyMarker = new OpenLayers.Marker(point, identifyIcon);
            identifyLayer.addMarker(identifyMarker);

            this._popup = new Popup({
                title: "Информация об объекте",
                point: point,
                size: [this.popupWidth, this.popupHeight]
            });

            var widget = new Widget({
                response: response,
                layersManager: this.layersManager,
                tool: this,
                layerLabels: layerLabels,
                popupSize: [this.popupWidth, this.popupHeight]
            });
            this._popup.widget = widget;

            widget.placeAt(this._popup.contentDiv).startup();

            this.map.olMap.addPopup(this._popup);
            widget.resize();

            // Обработчик закрытия
            on(this._popup._closeSpan, "click", lang.hitch(this, function () {
                this._removePopup();
            }));
        },

        _clearIdentifyLayer: function () {
            identifyLayer.clearMarkers();
        },

        _addIdentifyLayer: function () {
            var olMap = this.display.map.olMap;
            if (olMap.getLayersByName(identifyLayerName).length === 0) {
                olMap.addLayer(identifyLayer);
            }
            olMap.setLayerIndex(identifyLayer, 9999);
        }
    });
});
