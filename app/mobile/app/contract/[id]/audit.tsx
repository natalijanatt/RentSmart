import React, { useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useContractsStore } from '../../../store/contractsStore';
import { auditService } from '../../../services';
import { Card, Badge, LoadingSpinner, Divider } from '../../../components';
import { Colors, Spacing, Typography } from '../../../constants/theme';
import {
  formatDateTime,
  getAuditEventLabel,
  getContractStatusLabel,
} from '../../../utils/formatters';

interface AuditEventItem {
  id: string;
  eventType: string;
  timestamp: string;
  actorRole: string | null;
  details: string;
}

export default function AuditTrailScreen() {
  const { id } = useLocalSearchParams();
  const { isLoading, setIsLoading } = useContractsStore();
  const [events, setEvents] = React.useState<AuditEventItem[]>([]);
  const [chainValid, setChainValid] = React.useState(true);
  const [expandedEvent, setExpandedEvent] = React.useState<string | null>(null);

  const loadAuditTrail = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const response = await auditService.getAuditTrail(id as string);
      
      const formattedEvents: AuditEventItem[] = response.events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        timestamp: event.created_at,
        actorRole: event.actor_role,
        details: getAuditEventLabel(event.event_type),
      }));

      setEvents(formattedEvents);
      setChainValid(response.chain_valid);
    } catch (error) {
      console.error('Error loading audit trail:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id, setIsLoading]);

  useFocusEffect(
    useCallback(() => {
      loadAuditTrail();
    }, [loadAuditTrail])
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const getEventColor = (eventType: string): string => {
    if (eventType.includes('STARTED')) return Colors.info;
    if (eventType.includes('COMPLETED') || eventType.includes('APPROVED')) return Colors.success;
    if (eventType.includes('REJECTED') || eventType.includes('CANCELLED')) return Colors.error;
    if (eventType.includes('PENDING')) return Colors.warning;
    return Colors.textSecondary;
  };

  const getActor = (role: string | null): string => {
    if (!role) return 'System';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const renderEventItem = (event: AuditEventItem, index: number) => (
    <TouchableOpacity
      key={event.id}
      onPress={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
      style={styles.eventItem}
    >
      <View style={styles.eventTimeline}>
        <View
          style={[
            styles.timelineCircle,
            { backgroundColor: getEventColor(event.eventType) },
          ]}
        />
        {index < events.length - 1 && (
          <View style={styles.timelineConnector} />
        )}
      </View>

      <View style={styles.eventContent}>
        <View style={styles.eventHeader}>
          <View style={styles.eventInfo}>
            <Text style={[styles.eventTitle, Typography.body]}>
              {event.details}
            </Text>
            <Text style={[styles.eventTime, Typography.caption]}>
              {formatDateTime(event.timestamp)}
            </Text>
          </View>
          {event.actorRole && (
            <Badge
              label={getActor(event.actorRole)}
              variant={
                event.actorRole === 'landlord'
                  ? 'info'
                  : event.actorRole === 'tenant'
                    ? 'primary'
                    : 'warning'
              }
              size="small"
            />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, Typography.heading3]}>Audit Trail</Text>
        {chainValid ? (
          <Badge label="Chain Valid ✓" variant="success" size="small" />
        ) : (
          <Badge label="Chain Invalid ✗" variant="error" size="small" />
        )}
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, Typography.body]}>
            No events recorded yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          renderItem={({ item, index }) => renderEventItem(item, index)}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
        />
      )}

      {chainValid && (
        <Card style={styles.validationCard}>
          <Text style={[styles.validationText, Typography.caption]}>
            ✓ Blockchain hash chain valid - all events cryptographically linked
          </Text>
        </Card>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    color: Colors.text,
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  eventItem: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
  },
  eventTimeline: {
    alignItems: 'center',
    marginRight: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  timelineCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  timelineConnector: {
    width: 2,
    height: 60,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  eventContent: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: Spacing.md,
    borderLeftWidth: 3,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  eventInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  eventTitle: {
    color: Colors.text,
    fontWeight: '600' as const,
    marginBottom: Spacing.xs,
  },
  eventTime: {
    color: Colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
  },
  validationCard: {
    margin: Spacing.lg,
    backgroundColor: Colors.success,
  },
  validationText: {
    color: Colors.surface,
    textAlign: 'center',
  },
});
