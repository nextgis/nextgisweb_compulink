define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/topic',
    'dojo/Deferred',
    'dojo/request/xhr',
    'dojo/on',
    'dijit/registry',
    'ngw/openlayers'
], function (declare, lang, topic, Deferred, xhr, on, registry, openlayers) {
    return declare([], {
        settings: {},

        LayerLevels: {
            federal: 3,
            region: 2,
            district: 1
        },

        constructor: function (map) {
            this.map = map;

            //start state
            this.activeLayerLevel = this.LayerLevels.federal;
            this.selectedFederalDist = null;
            this.selectedRegion = null;
            this.selectedDistrict = null;
            this.filterResourceId = 'root';

            //create layers
            this.federalLayer = new openlayers.Layer.Vector("Federal", {
                        projection: new openlayers.Projection("EPSG:3857"),
                        styleMap: this.getAreaStyle(),
                        eventListeners: {
                             'featureselected': lang.hitch(this, this.routeFeatureSelect)
                        }
                });
            this.map.addLayer(this.federalLayer);

            this.regionLayer = new openlayers.Layer.Vector("Region", {
                        projection: new openlayers.Projection("EPSG:3857"),
                        visible: false
                });
            this.map.addLayer(this.regionLayer);

            this.districtLayer = new openlayers.Layer.Vector("Districts", {
                        projection: new openlayers.Projection("EPSG:3857"),
                        visible: false
                });
            this.map.addLayer(this.districtLayer);

            //select controls
            this.highlightCtrl= new openlayers.Control.SelectFeature(
                [this.federalLayer, this.regionLayer, this.districtLayer],
                {
                    hover: true,
                    highlightOnly: true,
                    renderIntent: "temporary"
                    // ,eventListeners: {
                    //     beforefeaturehighlighted: this.showQtip
                    // }
            });

            this.selectCtrl = new openlayers.Control.SelectFeature(
                [this.federalLayer, this.regionLayer, this.districtLayer],
                {clickout: true}
            );

            this.map.addControl(this.highlightCtrl);
            this.map.addControl(this.selectCtrl);

            this.highlightCtrl.activate();
            this.selectCtrl.activate();


            //bind events
            this.bindEvents();

            //update button states
            topic.publish('LayerLevel/switcher_state_changed', this.getSwitcherState());
            
            //load federal data
            this.updateFederalLayer(true);

            //temp!!!
            this.updateRegionLayer(true);
        },
        
             
        showQtip: function(olEvent){
            var elem = document.getElementById(olEvent.feature.geometry.components[0].id);
        
            $(elem).qtip({
                overwrite: true,
                content: olEvent.feature.attributes.name,
                show: { ready: true },
                position: {
                    my: "top center",
                    at: "center center"
                }
            }).qtip('show');
        },

        bindEvents: function () {
            topic.subscribe('LayerLevel/changed', lang.hitch(this, function (newLevel) {
                this.activeLayerLevel = newLevel;
                this.switchLayersVisibility(newLevel);
                topic.publish('LayerLevel/switcher_state_changed', this.getSwitcherState());
            }));
        },

        switchLayersVisibility: function(newLevel) {
            this.federalLayer.setVisibility(newLevel==this.LayerLevels.federal);
            this.regionLayer.setVisibility(newLevel==this.LayerLevels.region);
            this.districtLayer.setVisibility(newLevel==this.LayerLevels.district);
        },

        getSwitcherState: function() {
            return {
                federal: {
                    enabled: true,
                    active: this.activeLayerLevel==this.LayerLevels.federal
                },
                region: {
                    enabled: this.activeLayerLevel <= this.LayerLevels.region,
                    active: this.activeLayerLevel == this.LayerLevels.region
                },
                district: {
                    enabled: this.activeLayerLevel <= this.LayerLevels.district,
                    active: this.activeLayerLevel == this.LayerLevels.district
                }
            }
        },


        routeFeatureSelect: function(olEvent) {
            //zoom to
            this.map.zoomToExtent(olEvent.feature.geometry.bounds);
            //exec handler
            if(olEvent.feature.layer===this.federalLayer) this.federalObjectSelected(olEvent.feature);
            if(olEvent.feature.layer===this.regionLayer) this.regionObjectSelected(olEvent.feature);
            if(olEvent.feature.layer===this.districtLayer) this.districtObjectSelected(olEvent.feature);
            //deselect all
            this.selectCtrl.unselectAll();
        },
        federalObjectSelected: function(feat) {
            //TODO:
            // zoom to
            // 0. start wait cursor
            // 1. Clear reg and distr layers
            // 2. Update reg data (feat)
            topic.publish('LayerLevel/changed', this.LayerLevels.region);
            // 4. End wait cursor
        },
        regionObjectSelected: function(feat) {
            //TODO:
            // zoom to
            // 0. start wait cursor
            // 1. Clear distr layers
            // 2. Update distr data (feat)
            topic.publish('LayerLevel/changed', this.LayerLevels.district);
            // 4. End wait cursor
        },
        districtObjectSelected: function(feat) {
            //TODO:
            // zoom to
            // 0. start wait cursor
            // 1. Update table by distr id
            // 4. End wait cursor
        },
        
        updateFederalLayer: function(zoomTo) {
            $.get( "/compulink/statistic_map/get_federal_districts", {project_filter: this.filterResourceId})  //496
            .done(lang.hitch(this, function (data) {
                var format = new openlayers.Format.GeoJSON({ignoreExtraDims: true});
                var features = format.read(data);
                this.federalLayer.destroyFeatures();
                this.federalLayer.addFeatures(features);
                if(zoomTo) {
                    this.map.zoomToExtent(this.federalLayer.getDataExtent());
                }
            }))
            .fail(function() {
            })
            .always(function() {
            });
        },

        updateRegionLayer: function(zoomTo) {
            $.get( "http://127.0.0.1:6543/api/resource/496/geojson", {filterId: this.filterResourceId})  //496
            .done(lang.hitch(this, function (data) {
                var format = new openlayers.Format.GeoJSON({ignoreExtraDims: true});
                var features = format.read(data);
                this.regionLayer.destroyFeatures();
                this.regionLayer.addFeatures(features);
                if(zoomTo) {
                    this.map.zoomToExtent(this.regionLayer.getDataExtent());
                }
            }))
            .fail(function() {
            })
            .always(function() {
            });
        },

        getAreaStyle: function() {
            var defaultStyle = new OpenLayers.Style({
                'fillColor': '${color}',
                'strokeColor': '${color}',
                'fillOpacity': 0.4
                //, 'label' : "${short_name}",
                // 'fontColor': 'black',
                // 'labelOutlineColor': 'white'
            });

            var selectStyle = new OpenLayers.Style({
                'pointRadius': 20
            });

            var highlightStyle = new OpenLayers.Style({
                'pointRadius': 20
            });

            var styleMap = new OpenLayers.StyleMap({
                'default': defaultStyle
                // ,
                // 'select': selectStyle,
                // 'temporary': highlightStyle
            });

            return styleMap;
        }
    });
});