define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/_base/array',
    'dojo/on',
    'dojo/topic',
    'dojo/aspect',
    'dojo/Evented',
    'dojo/Deferred',
    'ngw/openlayers',
    './ui/CreateAcceptedPartDialog/CreateAcceptedPartDialog',
    './ui/AcceptedPartsTooltip/AcceptedPartsTooltip'
], function (declare, lang, array, on, topic, aspect, Evented, Deferred, openlayers,
             CreateAcceptedPartDialog, AcceptedPartsTooltip) {
    return declare(null, {
        ACCEPTED_PARTS_TOLERANCE: 40,
        OPTICAL_CABLE_LAYER_LINES_TOLERANCE: 20,
        OPTICAL_CABLE_LAYER_POINTS_TOLERANCE: 30,

        _drawFeatureControl: null,
        _snappingControl: null,
        _acceptedPartsStore: null,
        _acceptedPartsLayer: null,
        _actualRealOpticalCableStore: null,
        _actualRealOpticalCableLayer: null,
        _acceptedPartsTooltip: null,

        constructor: function (map, acceptedPartsStore, acceptedPartsLayer, actualRealOpticalCableStore,
                               actualRealOpticalCableLayer) {
            this._map = map;
            this._acceptedPartsStore = acceptedPartsStore;
            this._acceptedPartsLayer = acceptedPartsLayer;
            this._actualRealOpticalCableStore = actualRealOpticalCableStore;
            this._actualRealOpticalCableLayer = actualRealOpticalCableLayer;
            this._bindEvents();
            this._createControls();
        },

        _bindEvents: function () {
            topic.subscribe('compulink/accepted-parts/ui/create-new-accepted-part/changed', lang.hitch(this, function (state) {
                if (state) {
                    this._activate();
                } else {
                    this._deactivate();
                    topic.publish('compulink/accepted-parts/layers/first-point/undo/off');
                }
            }));

            topic.subscribe('compulink/accepted-parts/layers/first-point/undo', lang.hitch(this, function () {
                if (this._lastPointVerifyResult.pointsInSketchLine === 2) {
                    this._drawFeatureControl.cancel();
                    topic.publish('compulink/accepted-parts/layers/first-point/undo/off');
                    return true;
                }
            }));

            on(this._acceptedPartsStore, 'cleared', lang.hitch(this, function () {
                this._deactivate();
            }));
        },

        _createControls: function () {
            var defaultDrawControlStyle;

            this._drawFeatureControl = new openlayers.Control.DrawFeature(
                this._acceptedPartsLayer._layer,
                openlayers.Handler.Path
            );

            defaultDrawControlStyle = this._drawFeatureControl.handlerOptions.layerOptions.styleMap.styles.default.defaultStyle;
            defaultDrawControlStyle.strokeOpacity = 0;
            defaultDrawControlStyle.fillColor = 'red';
            defaultDrawControlStyle.fillOpacity = 1;
            defaultDrawControlStyle.pointRadius = 8;

            this._drawFeatureControl.handler.callbacks.point = lang.hitch(this, this._createPointSketchHandler);

            aspect.after(this._drawFeatureControl.handler, 'up', lang.hitch(this, this._afterDrawUpHandler));

            this._snappingControl = new openlayers.Control.Snapping({
                layer: this._acceptedPartsLayer._layer,
                targets: [
                    {
                        layer: this._acceptedPartsLayer._layer,
                        tolerance: this.ACCEPTED_PARTS_TOLERANCE,
                        edge: false
                    },
                    {
                        layer: this._actualRealOpticalCableLayer._layer,
                        tolerance: this.OPTICAL_CABLE_LAYER_LINES_TOLERANCE,
                        node: false,
                        vertex: false,
                        edge: true
                    },
                    {
                        layer: this._actualRealOpticalCableLayer._layer,
                        tolerance: this.OPTICAL_CABLE_LAYER_POINTS_TOLERANCE,
                        node: false,
                        vertex: true,
                        edge: false
                    }
                ],
                greedy: false
            });

            this._acceptedPartsTooltip = new AcceptedPartsTooltip(this._map);
        },

        _activate: function () {
            this._map.olMap.addControl(this._drawFeatureControl);
            this._snappingControl.activate();
            this._drawFeatureControl.activate();
            this._setDrawLayerZIndex();
            this._acceptedPartsTooltip.activate('Введите начальную точку');
        },

        _setDrawLayerZIndex: function () {
            this._drawFeatureControl.handler.layer.cl_zIndex = 999999;
            this._drawFeatureControl.handler.layer.setZIndex(999999);
        },

        _deactivate: function () {
            this._map.olMap.removeControl(this._drawFeatureControl);
            this._snappingControl.deactivate();
            this._drawFeatureControl.deactivate();
            this._acceptedPartsTooltip.deactivate();
        },

        _lastPointVerifyResult: {
            result: false,
            pointsInSketchLine: 0
        },

        _isCreateCalled: false,

        _createPointSketchHandler: function (point, sketchLine) {
            var pointsInSketchLine = sketchLine.components.length,
                verifyResult = true;

            this._isCreateCalled = true;

            if (pointsInSketchLine === 2) {
                verifyResult = this._verifyStartPoint(point, sketchLine);
                this._lastPointVerifyResult = {
                    result: verifyResult,
                    pointsInSketchLine: pointsInSketchLine
                };
            }

            if (pointsInSketchLine === 3) {
                verifyResult = this._verifyEndPoint(point, sketchLine);
                this._lastPointVerifyResult = {
                    result: verifyResult,
                    pointsInSketchLine: pointsInSketchLine
                };
            }
        },

        _afterDrawUpHandler: function () {
            // if moving map by pressed left mouse button
            // this._isCreateCalled should be equal false
            if (this._isCreateCalled) {
                this._isCreateCalled = false;
            } else {
                return true;
            }

            if (!this._lastPointVerifyResult) return true;

            var pointsInSketchLine = this._lastPointVerifyResult.pointsInSketchLine;

            // check points consistency
            if (pointsInSketchLine > 3) {
                console.error(new Exception('_afterDrawUpHandler: pointsInSketchLine = ' + pointsInSketchLine));
            } else if (pointsInSketchLine < 2) {
                return true;
            }

            if (this._lastPointVerifyResult.result && pointsInSketchLine === 2) {
                topic.publish('compulink/accepted-parts/layers/first-point/undo/on');
                this._makeStartPoint();
                this._setTooltipEndMessage();
                this._resetLastPointVerifyResult();
                return true;
            }

            // if start point, then this._lastPointVerifyResult.pointsInSketchLine === 2
            if (this._lastPointVerifyResult.pointsInSketchLine === 2) {
                this._drawFeatureControl.cancel();
                this._resetLastPointVerifyResult();
                return true;
            }

            // if this._lastPointVerifyResult.pointsInSketchLine !== 2 then current point is end point
            if (this._lastPointVerifyResult.result) {
                topic.publish('compulink/accepted-parts/layers/first-point/undo/off');
                var acceptedGeometry = this._createAcceptedPartGeometry();
                if (acceptedGeometry) {
                    this._drawFeatureControl.cancel();
                    this._openCreateAcceptedPartsDialog(acceptedGeometry);
                }
                this._resetLastPointVerifyResult();
                this._setTooltipStartMessage();
            } else {
                this._drawFeatureControl.undo();
                this._resetLastPointVerifyResult();
                return true;
            }
        },

        _resetLastPointVerifyResult: function () {
            this._lastPointVerifyResult.result = false;
        },

        _makeStartPoint: function () {
            var drawLayer = this._drawFeatureControl.handler.layer,
                featuresCount = drawLayer.features.length,
                startPointFeature;

            if (featuresCount > 2) {
                return false;
            }

            startPointFeature = drawLayer.features[1].clone();
            drawLayer.addFeatures(startPointFeature);
        },

        _openCreateAcceptedPartsDialog: function (acceptedPartGeometry) {
            var acceptedPartDialog = new CreateAcceptedPartDialog({
                acceptedPartsStore: this._acceptedPartsStore,
                acceptedPartGeometryWkt: this._getAcceptedPartWkt(acceptedPartGeometry)
            });
            acceptedPartDialog.show();
        },

        _getAcceptedPartWkt: function (acceptedPartGeometry) {
            var wkt = new openlayers.Format.WKT(),
                multiLinestring = new openlayers.Geometry.MultiLineString([acceptedPartGeometry]),
                acceptedPartFeature = new openlayers.Feature.Vector(multiLinestring);
            return wkt.write(acceptedPartFeature);
        },

        _createAcceptedPart: function (acceptedPartDialog, acceptedPartGeometry) {
            var wkt = new openlayers.Format.WKT(),
                acceptedPartFeature = new openlayers.Feature.Vector(new openlayers.Geometry.MultiLineString([acceptedPartGeometry])),
                acceptedPart = {},
                $input;
            $(acceptedPartDialog.domNode).find('input[data-field]').each(function (i, input) {
                $input = $(input);
                acceptedPart[$input.data('field')] = input.value;
            });
            acceptedPart.geom = wkt.write(acceptedPartFeature);
            this._acceptedPartsStore.createAcceptedPart(acceptedPart);
        },

        _verifyStartPoint: function (point, sketchLine) {
            var startPoint = sketchLine.components[0];
            return (this._isPointContainsInLinesLayer(startPoint, this._actualRealOpticalCableLayer._layer) === true) &&
                (this._verifyPointByAcceptedPartsLayer(startPoint));
        },

        _verifyEndPoint: function (point, sketchLine) {
            var startPoint = sketchLine.components[0],
                endPoint = sketchLine.components[1],
                linestring;

            if (this._isPointContainsInLinesLayer(endPoint, this._actualRealOpticalCableLayer._layer) !== true ||
                this._verifyPointByAcceptedPartsLayer(startPoint) !== true) {
                return false;
            }

            if (startPoint.distanceTo(endPoint) === 0) {
                return false;
            }

            linestring = this._pointsOnOneLine(startPoint, endPoint, this._actualRealOpticalCableLayer._layer.features[0].geometry);
            if (!linestring) {
                return false;
            }

            return {
                startPoint: startPoint,
                endPoint: endPoint,
                linestring: linestring
            };
        },

        _verifyPointByAcceptedPartsLayer: function (point) {
            if (this._isPointContainsInLinesLayer(point, this._acceptedPartsLayer._layer) === false) {
                return true;
            }

            var acceptedPartFeatures = this._acceptedPartsLayer._layer.features,
                countAcceptedParts = acceptedPartFeatures.length,
                countPointsInAcceptedPart,
                acceptedPartLine;

            for (var i = 0; i < countAcceptedParts; i++) {
                acceptedPartLine = acceptedPartFeatures[i].geometry.components[0];
                countPointsInAcceptedPart = acceptedPartLine.components.length;
                if (point.equals(acceptedPartLine.components[0])) return true;
                if (point.equals(acceptedPartLine.components[countPointsInAcceptedPart - 1])) return true;
            }

            return false;
        },

        _pointsOnOneLine: function (startPoint, endPoint, multiline) {
            var isPointsOneLine = false;

            array.forEach(multiline.components, lang.hitch(this, function (linestring) {
                if (this._isPointContainsInLine(startPoint, linestring) &&
                    this._isPointContainsInLine(endPoint, linestring)) {
                    isPointsOneLine = linestring;
                    return false;
                }
            }));

            return isPointsOneLine;
        },

        _intersectsWithLayer: function (geometry, layer) {
            array.forEach(layer.features, function (feature) {
                if (geometry.intersects(feature.geometry)) return true;
            });
            return false;
        },

        _isPointContainsInLinesLayer: function (point, linesLayer) {
            var contained = false;
            array.forEach(linesLayer.features, lang.hitch(this, function (feature) {
                if (this._isPointContainsInLine(point, feature.geometry)) {
                    contained = true;
                    return true;
                }
            }));
            return contained;
        },

        _isPointContainsInLine: function (point, line) {
            return point.distanceTo(line) === 0;
        },

        _createAcceptedPartGeometry: function () {
            var verificationResult = this._lastPointVerifyResult.result,
                startPoint = verificationResult.startPoint,
                endPoint = verificationResult.endPoint,
                linestringPoints = verificationResult.linestring.components,
                linestringPointsCount = linestringPoints.length,
                acceptedPartGeometry = new openlayers.Geometry.LineString(),
                acceptedPartGeometryCreating = false,
                startPointContained, endPointContained,
                pointContained,
                linePoint,
                segment;

            for (var i = 0; i < linestringPointsCount; i++) {
                linePoint = linestringPoints[i];

                if (i === 0 && (linePoint.equals(startPoint) || linePoint.equals(endPoint))) {
                    acceptedPartGeometry.addComponent(linePoint);
                    acceptedPartGeometryCreating = true;
                    continue;
                }

                if (i === linestringPointsCount - 1) {
                    break;
                }

                segment = new openlayers.Geometry.LineString([linestringPoints[i - 1], linePoint]);

                startPointContained = this._isPointContainsInLine(startPoint, segment);
                endPointContained = this._isPointContainsInLine(endPoint, segment);

                if (startPointContained && endPointContained) {
                    acceptedPartGeometry = new openlayers.Geometry.LineString([startPoint, endPoint]);
                    break;
                }

                if (startPointContained || endPointContained) {
                    pointContained = startPointContained ? startPoint : endPoint;
                    if (acceptedPartGeometryCreating) {
                        acceptedPartGeometry.addComponent(pointContained);
                        break;
                    }
                    if (linestringPoints[i + 1].equals(pointContained)) {
                        acceptedPartGeometry.addComponent(pointContained);
                    } else {
                        acceptedPartGeometry.addComponent(pointContained);
                        acceptedPartGeometry.addComponent(linestringPoints[i + 1]);
                    }
                    acceptedPartGeometryCreating = true;
                    continue;
                }

                if (acceptedPartGeometryCreating) {
                    acceptedPartGeometry.addComponent(linePoint);
                }
            }

            if (acceptedPartGeometry.components.length > 1) {
                return acceptedPartGeometry;
            } else {
                return null;
            }
        },

        _setTooltipStartMessage: function () {
            this._acceptedPartsTooltip.updateMessage('Введите начальную точку');
        },

        _setTooltipEndMessage: function () {
            this._acceptedPartsTooltip.updateMessage('Введите конечную точку');
        }
    });
});