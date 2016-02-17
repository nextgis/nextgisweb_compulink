# -*- coding: utf-8 -*-
from __future__ import unicode_literals
import json
from datetime import date

import transaction
from dateutil.relativedelta import relativedelta
import os
from os import path, mkdir
from shutil import rmtree
import tempfile
from zipfile import ZipFile, ZIP_DEFLATED
import codecs
import geojson
from osgeo import ogr
from shapely.geometry import shape, mapping
from shapely.wkt import loads
from pyramid.httpexceptions import HTTPForbidden, HTTPNotFound, HTTPBadRequest
from pyramid.renderers import render_to_response
from pyramid.response import Response, FileResponse
from pyramid.view import view_config
from sqlalchemy.orm import joinedload_all
import sqlalchemy.sql as sql
import subprocess
from nextgisweb import DBSession, db
from nextgisweb.feature_layer.view import PD_READ, ComplexEncoder
from nextgisweb.resource import Resource, ResourceGroup, DataScope
from nextgisweb.resource.model import ResourceACLRule
from nextgisweb.vector_layer import VectorLayer, TableInfo
from ..compulink_admin.layers_struct_group import FOCL_LAYER_STRUCT, SIT_PLAN_LAYER_STRUCT, FOCL_REAL_LAYER_STRUCT,\
    OBJECTS_LAYER_STRUCT
from ..compulink_admin.model import SituationPlan, FoclStruct, FoclProject, PROJECT_STATUS_DELIVERED, \
    PROJECT_STATUS_BUILT, FoclStructScope
from ..compulink_admin.well_known_resource import DICTIONARY_GROUP_KEYNAME
from .. import compulink_admin
from ..compulink_admin.view import get_region_name, get_district_name, get_regions_from_resource, \
    get_districts_from_resource, get_project_statuses
from nextgisweb_compulink.compulink_reporting.model import ConstructionStatusReport
from nextgisweb_compulink.compulink_site import COMP_ID
from nextgisweb_log.model import LogEntry, LogLevels
from nextgisweb_lookuptable.model import LookupTable

from nextgisweb_compulink.compulink_site.view import get_extent_by_resource_id
from pyproj import Proj, transform
from config import EDITABLE_LAYERS

CURR_PATH = path.dirname(__file__)
ADMIN_BASE_PATH = path.dirname(path.abspath(compulink_admin.__file__))
GUID_LENGTH = 32


def setup_pyramid(comp, config):
    # todo: check URL's
    config.add_route(
        'compulink.editor.map',
        '/compulink/editor').add_view(show_map)

    config.add_route(
        'compulink.editor.json',
        '/compulink/editor/resources/child').add_view(get_child_resx_by_parent)

    config.add_route(
        'compulink.editor.focl_extent',
        '/compulink/editor/resources/focl_extent').add_view(get_focl_extent)

    config.add_route(
        'compulink.editor.layers_by_type',
        '/compulink/editor/resources/layers_by_type').add_view(get_layers_by_type)

    config.add_static_view(
        name='compulink/editor/static',
        path='nextgisweb_compulink:compulink_editor/static', cache_max_age=3600)

    config.add_route(
        'compulink.editor.get_focl_status',
        '/compulink/editor/resources/{id:\d+}/focl_status', client=('id',)) \
        .add_view(get_focl_status)
    config.add_route(
        'compulink.editor.set_focl_status',
        '/compulink/editor/resources/{id:\d+}/set_focl_status', client=('id',)) \
        .add_view(set_focl_status)


@view_config(renderer='json')
def get_child_resx_by_parent(request):
    if request.user.keyname == 'guest':
        raise HTTPForbidden()

    parent_resource_id = request.params.get('id', None)
    if parent_resource_id is None:
        raise HTTPBadRequest('Set "id" param!')
    else:
        parent_resource_id = parent_resource_id.replace('res_', '')
    is_root_node_requsted = parent_resource_id == '#'

    type_filter = request.params.get('type', None)

    dbsession = DBSession()
    if is_root_node_requsted:
        parent_resource_id = dbsession.query(Resource).filter(Resource.parent==None).all()[0].id

    parent_resource = dbsession.query(Resource).get(parent_resource_id)
    children = parent_resource.children

    suitable_types = [
        ResourceGroup.identity,
        FoclProject.identity,
        ]
    if type_filter == 'vols' or not type_filter:
        suitable_types.append(FoclStruct.identity)
    if type_filter == 'sit' or not type_filter:
        suitable_types.append(SituationPlan.identity)

    if not request.user.is_administrator:
        allowed_res_list = _get_user_resources_tree(request.user)

    child_resources_json = []
    for child_resource in children:
        if child_resource.identity in suitable_types:
            # remove system folders
            if child_resource.identity == ResourceGroup.identity and child_resource.keyname == DICTIONARY_GROUP_KEYNAME:
                continue
            # check permissions
            if not request.user.is_administrator and child_resource.id not in allowed_res_list:
                continue
            is_need_checkbox = child_resource.identity in (FoclProject.identity, SituationPlan.identity, FoclStruct.identity)
            has_children = child_resource.identity in (ResourceGroup.identity, FoclProject.identity)
            child_resources_json.append({
                'id': 'res_' + str(child_resource.id),
                'text': child_resource.display_name,
                'children': has_children,
                'has_children': has_children,
                'icon': child_resource.identity,
                'res_type': child_resource.identity,
                'a_attr': {'chb': is_need_checkbox}
            })

            if not is_need_checkbox:
                child_resources_json[-1]['state'] = {'disabled': True}

    dbsession.close()

    return Response(json.dumps(child_resources_json))


def _get_user_resources_tree(user):
    # get explicit rules
    rules_query = DBSession.query(ResourceACLRule)\
        .filter(ResourceACLRule.principal_id==user.principal_id)\
        .filter(ResourceACLRule.scope==DataScope.identity)\
        .options(joinedload_all(ResourceACLRule.resource))

    #todo: user groups explicit rules???

    allowed_res_ids = set()

    def get_child_perms_recursive(resource):
        # add self
        if resource.identity == FoclStruct.identity:
            if resource.has_permission(DataScope.write, user):
                allowed_res_ids.add(resource.id)
        elif resource.identity in [ResourceGroup.identity, FoclProject.identity]:
            allowed_res_ids.add(resource.id)
        # add childs
        if resource.identity in [ResourceGroup.identity, FoclProject.identity]:
            for child in resource.children:
                get_child_perms_recursive(child)

    def get_parents_recursive(resource):
        if resource.parent is not None:
            allowed_res_ids.add(resource.parent.id)
            get_parents_recursive(resource.parent)

    for rule in rules_query.all():
        get_child_perms_recursive(rule.resource)
        get_parents_recursive(rule.resource)

    return allowed_res_ids


def show_map(request):
    resource_id = int(request.GET['resource_id'])
    dbsession = DBSession()
    resource = dbsession.query(Resource).filter(Resource.id == resource_id).first()

    # checks
    if request.user.keyname == 'guest':
        raise HTTPForbidden()

    if not request.user.is_administrator or not resource.has_permission(FoclStructScope.edit_prop, request.user):
        raise HTTPForbidden()

    extent3857 = get_extent_by_resource_id(resource_id)
    extent4326 = _extent_3857_to_4326(extent3857)

    focl_layers = get_focl_layers_list()
    sit_plan_layers_type = get_sit_plan_layers_list()

    editable_layers = _get_editable_layers_items(resource_id)
    editable_layers_view_model = _create_editable_layers_view_model(editable_layers)

    values = dict(
        show_header=True,
        focl_layers_type=focl_layers['focl'],
        objects_layers_type=focl_layers['objects'],
        real_layers_type=focl_layers['real'],
        sit_plan_layers_type=sit_plan_layers_type,
        extent=extent4326,
        editable_layers_info=editable_layers_view_model
    )

    return render_to_response('nextgisweb_compulink:compulink_editor/templates/monitoring_webmap/display.mako',
                              values,
                              request=request)


def _extent_3857_to_4326(extent3857):
    if not extent3857:
        return [-179, -82, 180, 82]
    projection_3857 = Proj(init='EPSG:3857')
    projection_4326 = Proj(init='EPSG:4326')
    x1, y1 = tuple(extent3857[0:2])
    x2, y2 = tuple(extent3857[2:4])

    extent4326 = list(transform(projection_3857, projection_4326, x1, y1)) + \
        list(transform(projection_3857, projection_4326, x2, y2))

    return extent4326


def _get_editable_layers_items(resource_id):
    editable_layers = []
    dbsession = DBSession()

    resource = dbsession.query(Resource).filter(Resource.id == resource_id).first()

    for child_resource in resource.children:
        if child_resource.identity != VectorLayer.identity:
            continue
        if len(child_resource.keyname) < (GUID_LENGTH + 1):
            continue
        layer_keyname_without_guid = child_resource.keyname[0:-(GUID_LENGTH + 1)]
        if layer_keyname_without_guid not in EDITABLE_LAYERS:
            continue
        editable_layers.append({
            'resource': child_resource,
            'settings': EDITABLE_LAYERS[layer_keyname_without_guid]
        })

    dbsession.close()

    return editable_layers


def _create_editable_layers_view_model(editable_layers):
    editable_layers_model = []
    for editable_layer_item in editable_layers:
        editable_layers_model.append({
            'id': editable_layer_item['resource'].id,
            'style': editable_layer_item['settings']['style']
        })
    return editable_layers_model


def get_focl_layers_list():
    layer_order = len(FOCL_LAYER_STRUCT) + len(OBJECTS_LAYER_STRUCT) + len(FOCL_REAL_LAYER_STRUCT) +\
                  len(SIT_PLAN_LAYER_STRUCT)

    focl_layers_for_jstree = []
    layers_template_path = path.join(ADMIN_BASE_PATH, 'layers_templates/')
    for vl_name in reversed(FOCL_LAYER_STRUCT):
        with codecs.open(path.join(layers_template_path, vl_name + '.json'), encoding='utf-8') as json_file:
            json_layer_struct = json.load(json_file, encoding='utf-8')
            focl_layers_for_jstree.append({
                'text': json_layer_struct['resource']['display_name'],
                'idf-name': json_layer_struct['resource']['identify_name'],
                'id': vl_name,
                'children': False,
                'icon': vl_name,
                'order': layer_order
                })
        layer_order -= 1

    objects_layers_for_jstree = []
    layers_template_path = path.join(ADMIN_BASE_PATH, 'layers_templates/')
    for vl_name in reversed(OBJECTS_LAYER_STRUCT):
        with codecs.open(path.join(layers_template_path, vl_name + '.json'), encoding='utf-8') as json_file:
            json_layer_struct = json.load(json_file, encoding='utf-8')
            objects_layers_for_jstree.append({
                'text': json_layer_struct['resource']['display_name'],
                'idf-name': json_layer_struct['resource']['identify_name'],
                'id': vl_name,
                'children': False,
                'icon': vl_name,
                'order': layer_order
                })
        layer_order -= 1

    real_layers_for_jstree = []
    layers_template_path = path.join(ADMIN_BASE_PATH, 'real_layers_templates/')
    for vl_name in reversed(FOCL_REAL_LAYER_STRUCT):
        with codecs.open(path.join(layers_template_path, vl_name + '.json'), encoding='utf-8') as json_file:
            json_layer_struct = json.load(json_file, encoding='utf-8')
            real_layers_for_jstree.append({
                'text': json_layer_struct['resource']['display_name'],
                'idf-name': json_layer_struct['resource']['identify_name'],
                'id': vl_name,
                'children': False,
                'icon': vl_name,
                'order': layer_order
                })
        layer_order -= 1

    return {
        'focl': focl_layers_for_jstree,
        'objects': objects_layers_for_jstree,
        'real': real_layers_for_jstree
    }


def get_sit_plan_layers_list():
    layers_template_path = path.join(ADMIN_BASE_PATH, 'situation_layers_templates/')

    layers = []
    layer_order = len(SIT_PLAN_LAYER_STRUCT)

    for vl_name in reversed(SIT_PLAN_LAYER_STRUCT):
        with codecs.open(path.join(layers_template_path, vl_name + '.json'), encoding='utf-8') as json_file:
            json_layer_struct = json.load(json_file, encoding='utf-8')
            layers.append({
                'text': json_layer_struct['resource']['display_name'],
                'id': vl_name,
                'children': [],
                'icon': vl_name,
                'order': layer_order
            })
        layer_order -= 1
    return layers




def extent_union(extent, new_extent):
    return [
        extent[0] if extent[0] < new_extent[0] else new_extent[0],
        extent[1] if extent[1] < new_extent[1] else new_extent[1],
        extent[2] if extent[2] > new_extent[2] else new_extent[2],
        extent[3] if extent[3] > new_extent[3] else new_extent[3],
    ]


def extent_buff(extent, buff_size):
    if extent:
        return [
            extent[0] - buff_size,
            extent[1] - buff_size,
            extent[2] + buff_size,
            extent[3] + buff_size,
        ]
    return None


@view_config(renderer='json')
def get_focl_extent(request):
    if request.user.keyname == 'guest':
        raise HTTPForbidden()

    res_id = request.params.get('id', None)
    if res_id is None:
        return Response('[]')

    resp = {'extent': get_extent_by_resource_id(res_id)}
    return Response(json.dumps(resp))


def get_extent_by_resource_id(resource_id):
    dbsession = DBSession()
    resource = dbsession.query(Resource).filter(Resource.id == resource_id).first()

    extent = None
    for res in resource.children:
        if res.identity != VectorLayer.identity:
            continue

        tableinfo = TableInfo.from_layer(res)
        tableinfo.setup_metadata(tablename=res._tablename)

        columns = [db.func.st_astext(db.func.st_extent(db.text('geom')).label('box'))]
        query = sql.select(columns=columns, from_obj=tableinfo.table)
        extent_str = dbsession.connection().scalar(query)

        if extent_str:
            if not extent:
                extent = loads(extent_str).bounds
            else:
                new_extent = loads(extent_str).bounds
                extent = extent_union(extent, new_extent)

    dbsession.close()

    return extent_buff(extent, 1000)


@view_config(renderer='json')
def get_layers_by_type(request):
    if request.user.keyname == 'guest':
        raise HTTPForbidden()

    # TODO: optimize this!!!
    group_res_ids = request.POST.getall('resources')
    layer_types = request.POST.getall('types')

    if not group_res_ids or not layer_types:
        return Response("[]")

    layer_types.sort(reverse=True)
    resp_list = []

    dbsession = DBSession()
    #все ВОСЛ и СИТ планы для присланных ид
    group_resources = dbsession.query(Resource).options(joinedload_all('children.children')).filter(Resource.id.in_(group_res_ids)).all()

    for group_res in group_resources:
        for child_res in group_res.children:
            # Если не векторный слой или не имеет кейнейма - не подходит
            if child_res.identity != VectorLayer.identity or not child_res.keyname:
                continue
            lyr_type = _get_layer_type_by_name(layer_types, child_res.keyname)
            # Тип векторного слоя не подходит по присланному набору
            if not lyr_type:
                continue
            style_resorces = child_res.children
            # Если нет стилей - не подходит
            if not style_resorces:
                continue
            resp_list.append({
                'vector_id': child_res.id,
                'style_id': style_resorces[0].id,
                'res_id': group_res.id,
                'type': lyr_type,
                'res_type': group_res.identity
            })

    dbsession.close()
    return Response(json.dumps(resp_list))


def _get_layer_type_by_name(layers_types, name):
    for layer_type in layers_types:
        if name.startswith(layer_type):
            if '_point' in layer_type and '_point' not in name:
                continue
            if '_point' not in layer_type and '_point' in name:
                continue
            return layer_type
    return None


def get_all_dicts():
    dbsession = DBSession()
    dicts_resources = dbsession.query(LookupTable).all()

    dicts = {}
    for dict_res in dicts_resources:
        dicts[dict_res.keyname] = dict_res.val

    dbsession.close()

    return dicts

@view_config(renderer='json')
def get_focl_status(request):
    res_id = request.matchdict['id']
    dbsession = DBSession()

    try:
        focl_resource = dbsession.query(FoclStruct).get(res_id)
    except:
        raise HTTPNotFound()

    if not focl_resource:
        raise HTTPNotFound()

    if not focl_resource.has_permission(DataScope.write, request.user):
        raise HTTPForbidden()

    resp = {
        'statuses': get_project_statuses(),
        'focl_status': focl_resource.status
    }

    return Response(json.dumps(resp))


@view_config(renderer='json')
def set_focl_status(request):
    res_id = request.matchdict['id']
    dbsession = DBSession()

    new_status = request.params.get('status', None)
    if new_status is None or new_status not in get_project_statuses(as_dict=True).keys():
        raise HTTPBadRequest('Set right status!')

    # update resource
    try:
        focl_resource = dbsession.query(FoclStruct).get(res_id)
    except:
        raise HTTPNotFound()

    if not focl_resource:
        raise HTTPNotFound()

    if not focl_resource.has_permission(DataScope.write, request.user):
        raise HTTPForbidden()

    focl_resource.status = new_status
    focl_resource.persist()

    # update reports
    try:
        report_line = dbsession.query(ConstructionStatusReport).filter(ConstructionStatusReport.focl_res_id == res_id).one()
    except:
        report_line = None

    if report_line:
        now_dt = date.today()
        report_line.status = new_status
        if report_line.end_build_time and \
           now_dt > report_line.end_build_time.date() and \
           report_line.status not in [PROJECT_STATUS_BUILT, PROJECT_STATUS_DELIVERED]:
            report_line.is_overdue = True
            report_line.is_month_overdue = now_dt - relativedelta(months=1) > report_line.end_build_time.date()
        else:
            report_line.is_overdue = False
            report_line.is_month_overdue = False

        report_line.persist()

    return Response(json.dumps({'status': 'ok'}))


def reset_all_layers(request):
    focl_struct_id = None #TODO: need getting request params

    #TODO: need rights check!

    db_session = DBSession()
    transaction.manager.begin()

    focl_struct = db_session.query(FoclStruct).get(id==focl_struct_id)

    layers = focl_struct.children
    real_layer = None
    actual_layer = None

    for real_layer_name in FOCL_REAL_LAYER_STRUCT:
        # get real layer and actual layer
        for lyr in layers:
            if lyr.keyname:
                lyr_name = '_'.join(lyr.keyname.rsplit('_')[0:-1])
            else:
                continue

            if real_layer_name == lyr_name:
                real_layer = lyr

            if 'actual_' + real_layer_name == lyr_name:
                actual_layer = lyr

        if not real_layer or not actual_layer:
            print 'Ops! Needed layers not found!'
            return

        try:
            #clear actual layer
            actual_layer.feature_delete_all()
            #copy
            query = real_layer.feature_query()
            query.geom()

            for feat in query():
                feat.fields['change_author'] = u'Мобильное приложение'
                feat.fields['change_date'] = feat.fields['built_date']
                actual_layer.feature_put(feat)

            print "Layers %s was updated!" % actual_layer.keyname

        except Exception, ex:
            print "Error on update %s: %s" % (actual_layer.keyname, ex.message)
        db_session.flush()

    transaction.manager.commit()
    db_session.close()