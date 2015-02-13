define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/_base/array',
    'dojo/topic',
    'dojo/Deferred',
    'dojo/request/xhr',
    'dojo/aspect',
    'ngw-compulink-libs/jstree-3.0.9/jstree'
], function (declare, lang, array, topic, Deferred, xhr, aspect, jstree) {
    return declare([], {
        $tree: null,
        settings: {},
        validators: {},

        constructor: function (domSelector, settings) {
            var context = this,
                $tree = this.$tree = jQuery(domSelector);

            this.setDefaultValues(settings);

            $tree.jstree({
                'core': {
                    'themes': {
                        'variant': 'small'
                    },
                    'data': {
                        'url': ngwConfig.applicationUrl + '/compulink/resources/child',
                        'data': lang.hitch(this, function (node) {
                            return this._getJsTreeQuery(node);
                        }),
                        success: function (data) {
                            return data;
                        },
                        dataType: 'json'
                    },
                    'strings': {
                        'Loading ...': 'Загружается...'
                    }
                },
                'checkbox': {
                    'keep_selected_style': false,
                    'two_state': true
                },
                'plugins': ['checkbox', 'types', 'ui']
            });
            this._bindEvents($tree);
        },

        _getJsTreeQuery: function (node) {
            var query;
            query = {'id': node.id};

            if (this.settings.type) {
                query.type = this.settings.type;
            }

            return query;
        },

        setDefaultValues: function (settings) {
            lang.mixin(this.settings, settings);

            this.settings.limitCheckedNodesCount = this.settings.limitCheckedNodesCount || null;
            this.settings.type = this.settings.type || null;
        },

        _previousState: null,
        _bindEvents: function ($tree) {
            var node,
                insertedDeletedNodes;

            $tree.on('changed.jstree', lang.hitch(this, function (e, changed) {

                if (this._setting_state) {
                    return false;
                }

                if (changed.action === 'deselect_all') {
                    this._previousState = this.$tree.jstree('get_state');
                    return false;
                }

                node = changed.node;
                if (node.original.has_children) {
                    if ($tree.jstree('is_loaded', node)) {
                        insertedDeletedNodes = this._getInsertedDeletedNodes(node.children, changed.action);
                        var validated = this._validate('LimitLayersValidator', insertedDeletedNodes);
                        if (validated) {
                            validated.then(lang.hitch(this, function (result) {
                                if (result) {
                                    this._previousState = this.$tree.jstree('get_state');
                                    this._fireTriggerChanged(node.children, changed.action);
                                } else {
                                    this._set_previous_state();
                                }
                            }))
                        } else {
                            this._fireTriggerChanged(node.children, changed.action);
                        }
                    } else {
                        $tree.jstree('load_all', node, lang.hitch(this, function (parent_node) {
                            var loaded_node = node;
                            this.$tree.on('after_open.jstree', lang.hitch(this, function (e, parent_node) {
                                insertedDeletedNodes = this._getInsertedDeletedNodes(parent_node.node.children, changed.action);

                                var validated = this._validate('LimitLayersValidator', insertedDeletedNodes);
                                if (validated) {
                                    validated.then(lang.hitch(this, function (result) {
                                        if (result) {
                                            this._previousState = this.$tree.jstree('get_state');
                                            this._fireTriggerChanged(node.children, changed.action);
                                        } else {
                                            this._set_previous_state();
                                        }
                                    }))
                                } else {
                                    this._fireTriggerChanged(parent_node.node.children, changed.action);
                                }

                                this.$tree.off('after_open.jstree');
                            }));

                            $tree.jstree('open_node', node);

                        }));

                    }
                } else {
                    this._previousState = this.$tree.jstree('get_state');
                    this._fireTriggerChanged(node.id, changed.action);
                }
            }));

            this.$tree.on('loaded.jstree', lang.hitch(this, function () {
                this._previousState = this.$tree.jstree('get_state');
            }));

            //this.$tree.on('load_node.jstree', lang.hitch(this, function (e, loaded) {
            //    console.log(loaded);
            //    if (loaded.node.id === '#') {
            //        this._bindClickChildNodesEvents(loaded.node, 'root');
            //    }
            //}));
            //
            //this.$tree.on('after_open.jstree', lang.hitch(this, function (e, opened) {
            //    this._bindClickChildNodesEvents(opened.node, 'after_open');
            //}));

            $tree.on('refresh.jstree', lang.hitch(this, function () {
                this._checkedResourcesId = this.$tree.jstree().get_bottom_selected();
            }));

            topic.subscribe('resources/type/set', lang.hitch(this, function (resourceType) {
                this.settings.type = resourceType === 'all' ? null : resourceType;
                this.$tree.jstree('refresh');
            }));
        },

        addValidator: function (validator) {
            this.validators[validator.validatorName] = validator;
            if (this.validators[validator.validatorName].bindEvents) {
                this.validators[validator.validatorName].bindEvents('ResourcesTree');
            }
        },

        _validate: function (validatorName, data) {
            if (this.validators[validatorName]) {
                return this.validators[validatorName]._validate('ResourcesTree', data);
            } else {
                return null;
            }
        },

        _bindClickChildNodesEvents: function (parentNode, initiator) {
            if (parentNode.click) {
                return false;
            }
            var $nodes;
            if (initiator === 'root') {
                $nodes = array.map(parentNode.children, function (id) {
                    return '#' + id + ' a:not(.jstree-disabled)';
                });
                $nodes = jQuery($nodes.join(','));
            } else if (initiator === 'after_open') {
                $nodes = jQuery('#' + parentNode.id + ' ul li a:not(.jstree-disabled)');
            } else if (initiator === 'click') {
                $nodes = null;
            }

            this._checkStatesNodes($nodes, parentNode, initiator);
        },

        _checkStatesNodes: function ($nodes, parentNode, initiator) {
            if ($nodes === null && parentNode.state.loaded === false && parentNode.original.has_children === true) {
                this.$tree.jstree('open_node', parentNode);
            }

            if (parentNode.click) {
                return false;
            }

            if ($nodes !== null && !parentNode.state.disabled) {
                this._bindClickNodesEvents($nodes, parentNode, initiator);
            }
        },

        _bindClickNodesEvents: function ($nodes, parentNode, initiator) {
            var $tree, node;
            $nodes.on('click', lang.hitch(this, function (e) {
                $tree = this.$tree;
                node = $tree.jstree('get_node', jQuery(e.currentTarget).parent().attr('id'));
                console.log(node);
                e.stopPropagation();


                if (node.state.loaded === false) {
                    $tree.jstree('load_node', node, function (loaded) {
                        $tree.jstree('select_node', node);
                    });

                    $tree.on('load_all.jstree', function (loaded) {
                        console.log(loaded);
                    });
                }

                if (this.validators['LimitLayersValidator']) {
                    this.validators['LimitLayersValidator']._validate('ResourcesTree', {
                        node: node,
                        $tree: $tree
                    });
                }
            }));

            if (initiator === 'root') {
                parentNode.click == true;
            }
        },

        _fireTriggerChanged: function (nodesId, action) {
            var insertedDeletedNodes = this._getInsertedDeletedNodes(nodesId, action);
            topic.publish('resources/changed', insertedDeletedNodes.bottom_selected, insertedDeletedNodes.inserted, insertedDeletedNodes.deleted);
        },

        _getInsertedDeletedNodes: function (nodesId, action) {
            var result = {
                bottom_selected: this.$tree.jstree().get_bottom_selected(),
                inserted: [],
                deleted: []
            };
            switch (action) {
                case 'select_node':
                    if (nodesId.constructor === Array) {
                        result.inserted = nodesId;
                    } else {
                        result.inserted.push(nodesId);
                    }
                    break;
                case 'deselect_node':
                    if (nodesId.constructor === Array) {
                        result.deleted = nodesId;
                    } else {
                        result.deleted.push(nodesId);
                    }
                    break;
            }

            return result;
        },

        _setting_state: false,
        _set_previous_state: function () {
            this.$tree.on('set_state.jstree', lang.hitch(this, function () {
                this._setting_state = false;
                this._previousState = this.$tree.jstree('get_state');
                this.$tree.off('set_state.jstree');
            }));

            this._setting_state = true;
            this.$tree.jstree('set_state', this._previousState);
        }
    });
});