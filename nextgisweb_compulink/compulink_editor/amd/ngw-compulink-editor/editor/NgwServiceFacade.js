define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/request/xhr',
    'dojox/dtl/_base'
], function (declare, lang, xhr, dtlBase) {

    return declare([], {
        constructor: function (ngwApplicationUrl) {
            if (ngwApplicationUrl) {
                this.ngwApplicationUrl = ngwApplicationUrl;
            } else if (ngwConfig && ngwConfig.applicationUrl) {
                this.ngwApplicationUrl = ngwConfig.applicationUrl;
            } else {
                this.ngwApplicationUrl = '';
            }
        },

        GET_FEATURE: new dtlBase.Template('/api/resource/{{resourceId}}/feature/{{featureId}}', true),
        EDIT_FEATURE: new dtlBase.Template('/api/resource/{{resourceId}}/feature/{{featureId}}', true),
        GET_ALL_FEATURES: new dtlBase.Template('/api/resource/{{resourceId}}/feature/', true),
        GET_RESOURCE: new dtlBase.Template('/api/resource/{{resourceId}}', true),
        SAVE_EDITOR_FEATURES: '/compulink/editor/features/save',
        REMOVE_EDITOR_FEATURES: '/compulink/editor/features/remove',
        CREATE_EDITOR_LINE: '/compulink/editor/lines/create',
        UPDATE_EDITOR_LINES: new dtlBase.Template('/compulink/editor/construct_line/{{resourceId}}', true),
        RESET_FEATURE: '/compulink/editor/reset_point',
        RESET_LAYERS: new dtlBase.Template('/compulink/editor/reset_layer/{{resourceId}}', true),

        ngwApplicationUrl: null,

        getAllFeatures: function (resourceId) {
            var dtlContext = new dtlBase.Context({resourceId: resourceId}),
                url = this.ngwApplicationUrl + this.GET_ALL_FEATURES.render(dtlContext);
            return xhr.get(url, {
                handleAs: 'json'
            });
        },

        getFeature: function (resourceId, featureId) {
            var dtlContext = new dtlBase.Context({resourceId: resourceId, featureId: featureId}),
                url = this.ngwApplicationUrl + this.GET_FEATURE.render(dtlContext);
            return xhr.get(url, {
                handleAs: 'json'
            });
        },

        getResourceInfo: function (resourceId) {
            var dtlContext = new dtlBase.Context({resourceId: resourceId}),
                url = this.ngwApplicationUrl + this.GET_RESOURCE.render(dtlContext);
            return xhr.get(url, {
                handleAs: 'json'
            });
        },

        /**
         * Represents a facade for saving modified features in editor.
         * @features {array of objects} Object should have following properties: wkt - wkt string, id - feature Id in NGW, layer - layer (or resource) Id in NGW
         */
        saveEditorFeatures: function (features) {
            var url = this.ngwApplicationUrl + this.SAVE_EDITOR_FEATURES;
            return xhr.post(url, {
                handleAs: 'json',
                data: JSON.stringify(features)
            });
        },

        changeFeature: function (layerId, featureId, geom, fields) {
            var dtlContext = new dtlBase.Context({resourceId: layerId, featureId: featureId}),
                url = this.ngwApplicationUrl + this.EDIT_FEATURE.render(dtlContext),
                feature = {
                    id: featureId
                };

            if (geom) feature.geom = geom;
            if (fields) feature.fields = fields;

            return xhr.put(url, {
                handleAs: 'json',
                data: JSON.stringify(feature)
            });
        },

        removeFeatures: function (features) {
            var url = this.ngwApplicationUrl + this.REMOVE_EDITOR_FEATURES;
            return xhr.del(url, {
                handleAs: 'json',
                data: JSON.stringify(features)
            });
        },

        updateEditorLines: function (resourceId) {
            var dtlContext = new dtlBase.Context({resourceId: resourceId}),
                url = this.ngwApplicationUrl + this.UPDATE_EDITOR_LINES.render(dtlContext);

            return xhr.post(url, {
                handleAs: 'json'
            });
        },

        /**
         * Represents a facade for creating new line.
         * @lineInfo Object should have the following properties:
         * line: {
         *    start: {
         *        ngwLayerId: \d+,
         *        ngwFeatureId: \d+
         *    },
         *    end: {
         *        ngwLayerId: \d+,
         *        ngwFeatureId: \d+
         *    },
         *    type: '[vols | stp]'
         * }
         */
        createEditorLine: function (lineInfo) {
            var url = this.ngwApplicationUrl + this.CREATE_EDITOR_LINE;

            return xhr.put(url, {
                handleAs: 'json',
                data: JSON.stringify(lineInfo)
            });
        },

        /**
         * Represents a facade for reverting one point.
         * @ngwLayerId Id of the NGW layer
         * @ngwFeatureId Id of the NGW feature
         */
        resetFeature: function (ngwLayerId, ngwFeatureId) {
            var url = this.ngwApplicationUrl + this.RESET_FEATURE,
                params = {
                    ngwLayerId: ngwLayerId,
                    ngwFeatureId: ngwFeatureId
                };

            return xhr.post(url, {
                handleAs: 'json',
                data: JSON.stringify(params)
            });
        },

        resetLayers: function (resourceId) {
            var dtlContext = new dtlBase.Context({resourceId: resourceId}),
                url = this.ngwApplicationUrl + this.RESET_LAYERS.render(dtlContext);

            return xhr.post(url, {
                handleAs: 'json'
            });
        }
    });
});