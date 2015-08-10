from pprint import pprint
import numpy as np
from shapely.geometry import Point, LineString, MultiLineString
import transaction
from .abstract_reactor import AbstractReactor
from nextgisweb import DBSession
from .. import COMP_ID
from nextgisweb.feature_layer import Feature
from nextgisweb.vector_layer import TableInfo
from nextgisweb_compulink.compulink_admin.model import FoclStruct
from .connector import SOM1d
from nextgisweb_log.model import LogEntry

__author__ = 'yellow'

@AbstractReactor.registry.register
class ConstructFoclLineReactor(AbstractReactor):
    identity = 'construct_line'
    priority = 1

    @classmethod
    def run(cls, env):
        LogEntry.info('ConstructFoclLineReactor started!', component=COMP_ID, group=ConstructFoclLineReactor.identity)

        db_session = DBSession()
        transaction.manager.begin()

        fs_resources = db_session.query(FoclStruct).all()
        for fs in fs_resources:
            points_lyr = [lyr for lyr in fs.children if lyr.keyname and lyr.keyname.startswith('real_optical_cable_point')]
            points_lyr = points_lyr[0] if len(points_lyr) else None

            lines_lyr = [lyr for lyr in fs.children if lyr.keyname and
                         not lyr.keyname.startswith('real_optical_cable_point') and
                         lyr.keyname.startswith('real_optical_cable')]
            lines_lyr = lines_lyr[0] if len(lines_lyr) else None

            query = points_lyr.feature_query()
            query.geom()
            result = query()

            if result.total_count > 0:
                LogEntry.debug('Construct line for %s started!' % fs.display_name, component=COMP_ID, group=ConstructFoclLineReactor.identity)
            else:
                LogEntry.debug('Construct line for %s skeeped (no points)!' % fs.display_name, component=COMP_ID, group=ConstructFoclLineReactor.identity)
                continue

            features = [feature for feature in result]

            #clear line lyr
            cls.clear_layer(lines_lyr)

            #get clusters
            clusters = cls.get_clusters(features)
            print 'New cluster: '
            pprint(clusters)

            #merge points in clusters
            for cluster in clusters:
                if len(cluster) < 2:
                    LogEntry.warning('Line %s has unclustered point!' % fs.display_name, component=COMP_ID, group=ConstructFoclLineReactor.identity)
                    continue
                if len(cluster) == 2:
                    # construct segment
                    points = tuple(feat.geom[0].coords[0] for feat in cluster)
                    # write segment
                    cls.write_segment(lines_lyr, points, cluster)
                    print 'segment line!'
                if len(cluster) > 2:
                    line = cls.make_line(cluster)
                    # write segments
                    for i in range(len(line[0])-1):
                        points = (line[0][i], line[0][i+1])
                        cls.write_segment(lines_lyr, points, cluster)
                    print line

            db_session.flush()


        transaction.manager.commit()


    @classmethod
    def get_clusters(cls, features):
        # get clusters
        clusters = []

        def feat_in_clusters(search_feat):
            for cluster in clusters:
                for feat in cluster:
                    if search_feat == feat:
                        return True
            return False

        def try_append_to_clusters(new_feat):
            for cluster in clusters:
                for feat in cluster:
                    geom_1 = feat.geom
                    geom_2 = new_feat.geom
                    if geom_1.distance(geom_2) <= 300:
                        cluster.append(new_feat)
                        return True
            return False

        exists_unhandled_points = True

        while exists_unhandled_points:
            start_point = None
            active_cluster = []
            exists_unhandled_points = False

            for feat_result in features:
                if feat_in_clusters(feat_result):
                    continue

                # get first point for cluster
                if not start_point:
                    start_point = feat_result
                    active_cluster.append(start_point)
                    clusters.append(active_cluster)
                    continue

                #append to existing cluster
                if not try_append_to_clusters(feat_result):
                    exists_unhandled_points = True

        return clusters


    @classmethod
    def make_line(cls, cluster):
        # NGW geoms to np
        points = [feat.geom[0].coords[0] for feat in cluster]
        data = np.array(points)

        #conn = MST(data)
        #result = conn.connect()

        som = SOM1d(data)
        result = som.connect()

        #np to NGW
        #res_lines = []
        #for line in result:
        #    res_lines.append(LineString(line))
        #return res_lines[0]

        return result

    @classmethod
    def clear_layer(cls, layer):
        tableinfo = TableInfo.from_layer(layer)
        tableinfo.setup_metadata(tablename=layer._tablename)
        DBSession.query(tableinfo.model).delete()

    @classmethod
    def write_segment(cls, layer, segment_points, cluster):
        print 'Write segmet: %s' % str(segment_points)
        feature_dict = []
        feature = Feature(fields=feature_dict, geom=MultiLineString([segment_points]))
        feature_id = layer.feature_create(feature)


