import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import type { AnalysisResult } from '@rentsmart/contracts';
import { useContractsStore } from '../../../store/contractsStore';
import { analysisService } from '../../../services';
import {
  Card,
  Badge,
  Divider,
  LoadingSpinner,
  ProgressBar,
  Button,
  EmptyState,
} from '../../../components';
import { Colors, Spacing, Typography } from '../../../constants/theme';

const CONDITION_CONFIG: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'error' | 'default'; icon: string }> = {
  excellent: { label: 'Odlično', variant: 'success', icon: '✓' },
  good:      { label: 'Dobro', variant: 'info', icon: '●' },
  fair:      { label: 'Zadovoljavajuće', variant: 'warning', icon: '▲' },
  damaged:   { label: 'Oštećeno', variant: 'error', icon: '✕' },
  unknown:   { label: 'Nepoznato', variant: 'default', icon: '?' },
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
  none:   { label: 'Bez oštećenja', color: Colors.success },
  minor:  { label: 'Mala šteta', color: '#4aa0d9' },
  medium: { label: 'Srednja šteta', color: Colors.warning },
  major:  { label: 'Velika šteta', color: Colors.error },
};

function getRoomLabel(roomType: string): string {
  const labels: Record<string, string> = {
    living_room: 'Dnevna soba',
    bedroom: 'Spavaća soba',
    bathroom: 'Kupatilo',
    kitchen: 'Kuhinja',
    hallway: 'Hodnik',
    balcony: 'Balkon',
    terrace: 'Terasa',
    garage: 'Garaža',
    storage: 'Ostava',
    other: 'Ostalo',
  };
  return labels[roomType] ?? roomType.replace(/_/g, ' ');
}

function FindingCard({ finding }: { finding: Record<string, unknown> }) {
  const severityKey = typeof finding.severity === 'string' ? finding.severity : 'minor';
  const severity = SEVERITY_CONFIG[severityKey] ?? SEVERITY_CONFIG.minor;
  const rawConfidence = typeof finding.confidence === 'number' ? finding.confidence : 0;
  const confidencePct = Math.round(rawConfidence * 100);
  const itemName = (finding.item ?? finding.type ?? 'Stavka') as string;
  const description = (finding.description ?? '') as string;
  const wearAndTear = finding.wear_and_tear === true;
  const locationInImage = typeof finding.location_in_image === 'string' ? finding.location_in_image : '';

  return (
    <View style={styles.findingCard}>
      <View style={styles.findingHeader}>
        <View style={[styles.severityDot, { backgroundColor: severity.color }]} />
        <Text style={[styles.findingItem, Typography.body]} numberOfLines={1}>
          {itemName}
        </Text>
        <View style={[styles.severityBadge, { backgroundColor: severity.color + '20' }]}>
          <Text style={[styles.severityText, { color: severity.color }]}>
            {severity.label}
          </Text>
        </View>
      </View>

      {description ? (
        <Text style={[styles.findingDescription, Typography.bodySmall]}>
          {description}
        </Text>
      ) : null}

      {rawConfidence > 0 && (
        <View style={styles.findingMeta}>
          <View style={styles.confidenceRow}>
            <Text style={[styles.metaLabel, Typography.caption]}>Pouzdanost</Text>
            <View style={styles.confidenceBar}>
              <ProgressBar
                progress={confidencePct}
                color={severity.color}
                height={6}
              />
            </View>
            <Text style={[styles.confidenceValue, Typography.caption]}>
              {confidencePct}%
            </Text>
          </View>

          {wearAndTear && (
            <View style={styles.wearBadge}>
              <Text style={[styles.wearText, Typography.caption]}>
                Normalno habanje
              </Text>
            </View>
          )}
        </View>
      )}

      {locationInImage ? (
        <Text style={[styles.locationText, Typography.caption]}>
          Lokacija: {locationInImage}
        </Text>
      ) : null}
    </View>
  );
}

function RoomCard({ result, isExpanded, onToggle }: {
  result: AnalysisResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const condition = CONDITION_CONFIG[result.overall_condition] ?? CONDITION_CONFIG.unknown;
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const findingsCount = findings.length;
  const damageCount = findings.filter(
    (f) => f.severity !== 'none' && !f.wear_and_tear,
  ).length;

  return (
    <Card style={styles.roomCard}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.roomHeader}>
          <View style={styles.roomInfo}>
            <Text style={[styles.roomName, Typography.heading4]}>
              {getRoomLabel(result.room)}
            </Text>
            <Badge
              label={condition.label}
              variant={condition.variant}
              size="small"
            />
          </View>
          <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
        </View>

        <Text style={[styles.roomSummary, Typography.bodySmall]} numberOfLines={isExpanded ? undefined : 2}>
          {result.summary || 'Nema opisa.'}
        </Text>

        <View style={styles.roomStats}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, Typography.heading4]}>{findingsCount}</Text>
            <Text style={[styles.statLabel, Typography.caption]}>
              {findingsCount === 1 ? 'nalaz' : 'nalaza'}
            </Text>
          </View>
          <View style={[styles.statDivider]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, Typography.heading4, damageCount > 0 && { color: Colors.error }]}>
              {damageCount}
            </Text>
            <Text style={[styles.statLabel, Typography.caption]}>
              {damageCount === 1 ? 'oštećenje' : 'oštećenja'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <>
          <Divider style={styles.findingsDivider} />
          {findingsCount === 0 ? (
            <Text style={[styles.noFindings, Typography.body]}>
              Nema pronađenih oštećenja.
            </Text>
          ) : (
            findings.map((finding, idx) => (
              <FindingCard key={idx} finding={finding as Record<string, unknown>} />
            ))
          )}
        </>
      )}
    </Card>
  );
}

export default function AnalysisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { analysis: rawAnalysis, setAnalysis, isLoading, setIsLoading } = useContractsStore();
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const analysis = Array.isArray(rawAnalysis) ? rawAnalysis : [];

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    if (!id) { setLoading(false); return; }
    try {
      const response = await analysisService.getAnalysisResults(id);
      setAnalysis(Array.isArray(response.analysis) ? response.analysis : []);
    } catch (error) {
      console.error('Error loading analysis:', error);
      Alert.alert('Greška', 'Nije moguće učitati rezultate analize.');
    } finally {
      setLoading(false);
    }
  }, [id, setAnalysis]);

  useFocusEffect(
    useCallback(() => {
      loadAnalysis();
    }, [loadAnalysis]),
  );

  const toggleRoom = (roomId: string) => {
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedRooms(new Set(analysis.map((r) => r.room_id)));
  };

  const collapseAll = () => setExpandedRooms(new Set());

  if (loading) return <LoadingSpinner />;

  if (analysis.length === 0) {
    return (
      <EmptyState
        title="Nema rezultata analize"
        description="AI analiza još uvek nije završena ili nema podataka za prikaz."
        icon="🔍"
      />
    );
  }

  const totalFindings = analysis.reduce((sum, r) => sum + (Array.isArray(r.findings) ? r.findings.length : 0), 0);
  const totalDamage = analysis.reduce(
    (sum, r) => sum + (Array.isArray(r.findings) ? r.findings.filter((f) => f.severity !== 'none' && !f.wear_and_tear).length : 0),
    0,
  );
  const allExpanded = expandedRooms.size === analysis.length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Button
          label="← Nazad"
          onPress={() => router.back()}
          variant="outline"
          size="small"
          style={styles.backButton}
        />

        <Text style={[styles.title, Typography.heading2]}>AI Analiza</Text>
        <Text style={[styles.subtitle, Typography.bodySmall]}>
          Automatska analiza stanja nekretnine na osnovu fotografija
        </Text>

        {/* Overview Card */}
        <Card style={styles.overviewCard}>
          <View style={styles.overviewRow}>
            <View style={styles.overviewStat}>
              <Text style={[styles.overviewValue, Typography.heading2]}>
                {analysis.length}
              </Text>
              <Text style={[styles.overviewLabel, Typography.caption]}>
                {analysis.length === 1 ? 'soba' : 'soba'}
              </Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewStat}>
              <Text style={[styles.overviewValue, Typography.heading2]}>
                {totalFindings}
              </Text>
              <Text style={[styles.overviewLabel, Typography.caption]}>
                {totalFindings === 1 ? 'nalaz' : 'nalaza'}
              </Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewStat}>
              <Text style={[styles.overviewValue, Typography.heading2, totalDamage > 0 && { color: Colors.error }]}>
                {totalDamage}
              </Text>
              <Text style={[styles.overviewLabel, Typography.caption]}>
                {totalDamage === 1 ? 'oštećenje' : 'oštećenja'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Expand/Collapse */}
        <TouchableOpacity onPress={allExpanded ? collapseAll : expandAll} style={styles.toggleRow}>
          <Text style={[styles.toggleText, Typography.bodySmall]}>
            {allExpanded ? 'Skupi sve' : 'Proširi sve'}
          </Text>
        </TouchableOpacity>

        {/* Room Cards */}
        {analysis.map((result, idx) => (
          <RoomCard
            key={`${result.room_id}-${idx}`}
            result={result}
            isExpanded={expandedRooms.has(result.room_id)}
            onToggle={() => toggleRoom(result.room_id)}
          />
        ))}

        {/* Navigate to settlement */}
        <Button
          label="Pogledaj poravnanje"
          onPress={() => router.push(`/contract/${id}/settlement`)}
          fullWidth
          style={styles.settlementButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },

  overviewCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.primaryLight,
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  overviewStat: {
    alignItems: 'center',
    flex: 1,
  },
  overviewValue: {
    color: Colors.surface,
    fontWeight: '700',
  },
  overviewLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: Spacing.xs,
  },
  overviewDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },

  toggleRow: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  toggleText: {
    color: Colors.primary,
    fontWeight: '600',
  },

  roomCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  roomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  roomName: {
    color: Colors.text,
    textTransform: 'capitalize',
  },
  chevron: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginLeft: Spacing.sm,
  },
  roomSummary: {
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  roomStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: Colors.text,
  },
  statLabel: {
    color: Colors.textTertiary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.divider,
  },

  findingsDivider: {
    marginVertical: Spacing.md,
  },
  noFindings: {
    color: Colors.success,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },

  findingCard: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  findingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  findingItem: {
    color: Colors.text,
    fontWeight: '600',
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: Spacing.sm,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '600',
  },
  findingDescription: {
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  findingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  metaLabel: {
    color: Colors.textTertiary,
    marginRight: Spacing.sm,
  },
  confidenceBar: {
    flex: 1,
    maxWidth: 80,
  },
  confidenceValue: {
    color: Colors.textSecondary,
    marginLeft: Spacing.sm,
    minWidth: 32,
    textAlign: 'right',
  },
  wearBadge: {
    backgroundColor: Colors.warning + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: Spacing.md,
  },
  wearText: {
    color: Colors.warning,
    fontWeight: '600',
  },
  locationText: {
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
  },

  settlementButton: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
});
