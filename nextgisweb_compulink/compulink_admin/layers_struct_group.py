# -*- coding: utf-8 -*-
# Добавлять слои в обратном порядке,
# относительно того как они будут в толстом клиенте

FOCL_LAYER_STRUCT = [
    #'other_polygon_object',
    #'other_line_object',
    #'gas_pipeline',
    #'oil_pipeline',
    #'overhead_power_line',
    #'other_point_object',
    'note',
    'special_transition',
    #'cellular_station',
    #'communication_center',
    #'electrical_substation',
    #'telecom_cabinet',
    'optical_cable',
    #'pole',
    'fosc',
    'optical_cross',
    'access_point',
    'endpoint',
]

OBJECTS_LAYER_STRUCT = [
    'transmission_tower',
    'sump_canalization',
]

FOCL_REAL_LAYER_STRUCT = [
    'real_special_transition',
    'real_special_transition_point',

    'real_optical_cable',
    'real_optical_cable_point',

    'real_fosc',
    'real_optical_cross',
    'real_access_point',
]

SIT_PLAN_LAYER_STRUCT = [
    'sp_other_polygon_object',
    #'sp_boundary',
    'sp_other_line_object',
    #'sp_gas_pipeline',
    #'sp_oil_pipeline',
    'sp_overhead_power_line',
    'sp_focl',
    'sp_other_point_object',
    'sp_note',
    #'sp_photo',
    #'sp_cellular_station',
    'sp_sump_canalization',
    'sp_communication_center',
    'sp_electrical_substation',
    'sp_access_point',
    'sp_fosc',
    'sp_optical_cross',
]

PROJECT_LAYER_STRUCT = [
]