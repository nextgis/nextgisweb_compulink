define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/_base/array',
    'dojo/html',
    'dojo/dom',
    'dojo/on',
    'dojo/query',
    'dojo/dom-class',
    'dojo/dom-construct',
    'dojo/promise/all',
    'dojo/topic',
    'dojo/date/locale',
    'dijit/_WidgetBase',
    'dijit/_TemplatedMixin',
    'ngw/settings!compulink_site',
    'ngw-compulink-site/InfoDialog',
    'ngw-compulink-libs/mustache/mustache',
    'dojo/text!./templates/AttributesEditorWrapper.mustache',
    'dojo/text!./templates/AttributesEditor.mustache',
    'xstyle/css!./templates/css/AttributesEditor.css',
    'dojox/dtl/tag/logic'
], function (declare, lang, array, html, dom, on, query, domClass, domConstruct,
             all, topic, locale, _WidgetBase, _TemplatedMixin,
             siteSettings, InfoDialog, mustache, templateWrapper, templateAttributes) {

    return declare([_WidgetBase, _TemplatedMixin], {
        _ngwServiceFacade: null,
        widgetsInTemplate: false,
        templateString: templateWrapper,
        templateAttributes: templateAttributes,
        ngwLayerId: null,
        ngwFeatureId: null,
        resourceDisplayName: editorConfig.resource_display_name,

        constructor: function () {
            mustache.parse(this.templateString);
            mustache.parse(this.templateAttributes);
            this.bindEvents();
        },

        setNgwServiceFacade: function (ngwServiceFacade) {
            this._ngwServiceFacade = ngwServiceFacade;
        },

        bindEvents: function () {
            topic.subscribe('/editor/feature/select', lang.hitch(this, function (feature) {
                if (!this._ngwServiceFacade) return false;
                this._setEditorState('wait');
                this.ngwLayerId = feature.attributes.ngwLayerId;
                this.ngwFeatureId = feature.attributes.ngwFeatureId;
                var getFeatureInfo = this._ngwServiceFacade.getFeature(this.ngwLayerId, this.ngwFeatureId),
                    resourceInfo = this._ngwServiceFacade.getResourceInfo(this.ngwLayerId);
                all([resourceInfo, getFeatureInfo]).then(lang.hitch(this, function (results) {
                    this.renderAttributes(results[0], results[1]);
                }));
            }));

            topic.subscribe('/editor/attributes/clear', lang.hitch(this, function () {
                var divAttributes = query('div.attributes', this.domNode)[0];
                html.set(divAttributes, '');
                this._setEditorState('empty');
            }));
        },

        _setEditorState: function (state) {
            var domNode = this.domNode;
            domClass.remove(domNode);
            domClass.add(domNode, state);
        },

        renderAttributes: function (resourceInfo, ngwFeatureInfo) {
            var viewModel = {
                    resource: resourceInfo.resource,
                    fields: []
                },
                viewModelField,
                layerFields = resourceInfo.feature_layer && resourceInfo.feature_layer.fields ?
                    resourceInfo.feature_layer.fields : null,
                divAttributes = query('div.attributes', this.domNode)[0],
                htmlContent;

            // TODO: need more flexible!
            var disabledFields = [
                'built_date', 'feat_guid', 'change_author', 'change_date',
                'is_deviation', 'deviation_distance', 'deviation_approved', 'approval_comment',
                'start_point'
            ];

            var all_dicts = siteSettings.dicts;
            var bool_fields = siteSettings.bool_fields;

            if (layerFields) {
                array.forEach(layerFields, function (field) {
                    if (ngwFeatureInfo.fields.hasOwnProperty(field.keyname)) {
                        var fieldValue = ngwFeatureInfo.fields[field.keyname];

                        if (field.datatype === 'DATETIME' && fieldValue) {
                            fieldValue = new Date(Date.UTC(fieldValue.year, fieldValue.month - 1, fieldValue.day,
                                fieldValue.hour, fieldValue.minute, fieldValue.second));

                            fieldValue = locale.format(fieldValue, {
                                datePattern: 'yyyy-MM-dd',
                                timePattern: 'hh:mm:ss'
                            });

                            fieldValue = fieldValue.replace(', ', 'T');
                        }

                        var isDictField = false,
                            isBoolField = false,
                            valsDict = null,
                            selVal = null;

                        if (all_dicts.hasOwnProperty(field.keyname)) {
                            isDictField = true;
                            valsDict = all_dicts[field.keyname];
                            selVal = ngwFeatureInfo.fields[field.keyname];
                            fieldValue = [];
                            for (var keyname in valsDict) {
                                if (valsDict.hasOwnProperty(keyname)) {
                                    fieldValue.push({
                                        val: keyname,
                                        text: valsDict[keyname],
                                        selected: selVal === keyname
                                    });
                                }
                            }
                        }

                        if (bool_fields.indexOf(field.keyname) >= 0) {
                            isBoolField = true;
                        }

                        viewModelField = {
                            displayName: field.display_name,
                            keyname: field.keyname,
                            value: fieldValue,
                            valsDict: valsDict
                        };

                        viewModelField['IS_DISABLED'] = disabledFields.indexOf(field.keyname) > -1;

                        viewModelField['IS_REF_BOOK'] = isDictField;
                        viewModelField['IS_BOOL'] = isBoolField;

                        if (!isBoolField && !isDictField) {
                            viewModelField['IS_' + field.datatype] = true;
                        }

                        viewModel.fields.push(viewModelField);
                    }
                }, this);
            }

            htmlContent = mustache.render(this.templateAttributes, viewModel);
            this._setEditorState('fill');
            html.set(divAttributes, htmlContent);

            on(query('input.save', this.domNode)[0], 'click', lang.hitch(this, function () {
                this._save();
            }));
        },

        _stringRepl: function (template) {
            return mustache.render(template, this);
        },

        buildRendering: function () {
            if (!this._rendered) {
                this.domNode = domConstruct.toDom(this._stringRepl(this.templateString), this.ownerDocument);
            }
            this._rendered = true;
        },

        _save: function () {
            var fields = {};
            $(this.domNode).find('.field_value:enabled').each(function () {
                var $element = $(this);
                fields[$element.attr('name')] = $element.val();
            });

            this._ngwServiceFacade.changeFeature(this.ngwLayerId, this.ngwFeatureId, null, fields).then(function () {
                new InfoDialog({
                    isDestroyedAfterHiding: true,
                    title: 'Изменения сохранены',
                    message: 'Значения атрибутов успешно сохранены'
                }).show();
            });
        }
    })
        ;
});