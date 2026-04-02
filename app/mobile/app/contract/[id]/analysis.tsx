import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Alert,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import type { AnalysisResult, InspectionImage } from '@rentsmart/contracts';
import { useContractsStore } from '../../../store/contractsStore';
import { analysisService, contractsService } from '../../../services';
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Config maps ─────────────────────────────────────────────────────────────

const CONDITION_CONFIG: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'error' | 'default'; icon: string }> = {
  excellent: { label: 'Excellent', variant: 'success', icon: '✓' },
  good:      { label: 'Good', variant: 'info', icon: '●' },
  fair:      { label: 'Fair', variant: 'warning', icon: '▲' },
  damaged:   { label: 'Damaged', variant: 'error', icon: '✕' },
  unknown:   { label: 'Unknown', variant: 'default', icon: '?' },
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
  none:   { label: 'No damage', color: Colors.success },
  minor:  { label: 'Minor damage', color: '#4aa0d9' },
  medium: { label: 'Medium damage', color: Colors.warning },
  major:  { label: 'Major damage', color: Colors.error },
};

function getRoomLabel(roomType: string): string {
  const labels: Record<string, string> = {
    living_room: 'Living room',
    bedroom: 'Bedroom',
    bathroom: 'Bathroom',
    kitchen: 'Kitchen',
    hallway: 'Hallway',
    balcony: 'Balcony',
    terrace: 'Terrace',
    garage: 'Garage',
    storage: 'Storage',
    other: 'Other',
    dnevna_soba: 'Living room',
    spavaca_soba: 'Bedroom',
    kupatilo: 'Bathroom',
    kuhinja: 'Kitchen',
    hodnik: 'Hallway',
    balkon: 'Balcony',
    terasa: 'Terrace',
    garaza: 'Garage',
    ostava: 'Storage',
    druga: 'Other',
  };
  return labels[roomType] ?? roomType.replace(/_/g, ' ');
}

// ─── Zoom modal ───────────────────────────────────────────────────────────────

type ZoomModalState = {
  checkinUrl: string | null;
  checkoutUrl: string | null;
  startSide: 'checkin' | 'checkout';
};

function ImageZoomModal({
  state,
  onClose,
}: {
  state: ZoomModalState;
  onClose: () => void;
}) {
  const [side, setSide] = useState<'checkin' | 'checkout'>(state.startSide);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zoomScrollRef = useRef<any>(null);

  const url = side === 'checkin' ? state.checkinUrl : state.checkoutUrl;
  const otherSide: 'checkin' | 'checkout' = side === 'checkin' ? 'checkout' : 'checkin';
  const otherUrl = side === 'checkin' ? state.checkoutUrl : state.checkinUrl;
  const label = side === 'checkin' ? 'Check-in' : 'Check-out';
  const otherLabel = side === 'checkin' ? 'Check-out' : 'Check-in';

  // Reset zoom when switching sides
  const switchSide = () => {
    zoomScrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    setSide(otherSide);
  };

  return (
    <View style={modalStyles.overlay}>
      {/* Header */}
      <View style={modalStyles.header}>
        <Text style={modalStyles.headerLabel}>{label}</Text>
        <TouchableOpacity
          onPress={onClose}
          style={modalStyles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={modalStyles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Zoomable image */}
      <ScrollView
        ref={zoomScrollRef}
        style={modalStyles.zoomScroll}
        contentContainerStyle={modalStyles.zoomContent}
        maximumZoomScale={4}
        minimumZoomScale={1}
        pinchGestureEnabled
        bouncesZoom
        centerContent
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={modalStyles.fullImage}
            resizeMode="contain"
          />
        ) : (
          <View style={modalStyles.noImageFull}>
            <Text style={modalStyles.noImageFullText}>No photo</Text>
          </View>
        )}
      </ScrollView>

      {/* Footer: switch to complementary image */}
      {otherUrl && (
        <TouchableOpacity style={modalStyles.switchRow} onPress={switchSide} activeOpacity={0.8}>
          <Image source={{ uri: otherUrl }} style={modalStyles.switchThumb} resizeMode="cover" />
          <View style={modalStyles.switchTextWrap}>
            <Text style={modalStyles.switchHint}>Tap to view</Text>
            <Text style={modalStyles.switchLabel}>{otherLabel}</Text>
          </View>
          <Text style={modalStyles.switchArrow}>›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 999,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingTop: 52,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  headerLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  zoomScroll: {
    flex: 1,
  },
  zoomContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.72,
  },
  noImageFull: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageFullText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingBottom: 36,
    backgroundColor: 'rgba(0,0,0,0.85)',
    gap: Spacing.md,
  },
  switchThumb: {
    width: 52,
    height: 52,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  switchTextWrap: {
    flex: 1,
  },
  switchHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
  },
  switchLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  switchArrow: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 26,
    fontWeight: '300',
  },
});

// ─── Image pair carousel ──────────────────────────────────────────────────────

const IMAGE_THUMB_HEIGHT = 130;
const IMAGE_THUMB_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.lg * 2 - 1) / 2;

function ImagePairCarousel({
  checkinUrls,
  checkoutUrls,
  onImagePress,
}: {
  checkinUrls: string[];
  checkoutUrls: string[];
  onImagePress: (state: ZoomModalState) => void;
}) {
  const [pairIndex, setPairIndex] = useState(0);
  const maxPairs = Math.max(checkinUrls.length, checkoutUrls.length);

  if (maxPairs === 0) return null;

  const checkinUrl = checkinUrls[pairIndex] ?? null;
  const checkoutUrl = checkoutUrls[pairIndex] ?? null;

  return (
    <View style={carouselStyles.container}>
      <View style={carouselStyles.header}>
        <Text style={carouselStyles.title}>Photos</Text>
        {maxPairs > 1 && (
          <Text style={carouselStyles.counter}>
            {pairIndex + 1} / {maxPairs}
          </Text>
        )}
      </View>

      <View style={carouselStyles.row}>
        {/* Check-in */}
        <View style={carouselStyles.imageCol}>
          <Text style={carouselStyles.typeLabel}>Check-in</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              onImagePress({ checkinUrl, checkoutUrl, startSide: 'checkin' })
            }
            disabled={!checkinUrl}
          >
            {checkinUrl ? (
              <Image
                source={{ uri: checkinUrl }}
                style={carouselStyles.thumb}
                resizeMode="cover"
              />
            ) : (
              <View style={[carouselStyles.thumb, carouselStyles.placeholder]}>
                <Text style={carouselStyles.placeholderText}>—</Text>
              </View>
            )}
            {checkinUrl && (
              <View style={carouselStyles.zoomHint}>
                <Text style={carouselStyles.zoomHintText}>⊕</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={carouselStyles.divider} />

        {/* Check-out */}
        <View style={carouselStyles.imageCol}>
          <Text style={carouselStyles.typeLabel}>Check-out</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              onImagePress({ checkinUrl, checkoutUrl, startSide: 'checkout' })
            }
            disabled={!checkoutUrl}
          >
            {checkoutUrl ? (
              <Image
                source={{ uri: checkoutUrl }}
                style={carouselStyles.thumb}
                resizeMode="cover"
              />
            ) : (
              <View style={[carouselStyles.thumb, carouselStyles.placeholder]}>
                <Text style={carouselStyles.placeholderText}>—</Text>
              </View>
            )}
            {checkoutUrl && (
              <View style={carouselStyles.zoomHint}>
                <Text style={carouselStyles.zoomHintText}>⊕</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation */}
      {maxPairs > 1 && (
        <View style={carouselStyles.navRow}>
          <TouchableOpacity
            onPress={() => setPairIndex((i) => Math.max(0, i - 1))}
            disabled={pairIndex === 0}
            style={[carouselStyles.navBtn, pairIndex === 0 && carouselStyles.navBtnDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[carouselStyles.navArrow, pairIndex === 0 && carouselStyles.navArrowDisabled]}>
              ‹
            </Text>
          </TouchableOpacity>

          <View style={carouselStyles.dots}>
            {Array.from({ length: maxPairs }).map((_, i) => (
              <View
                key={i}
                style={[carouselStyles.dot, i === pairIndex && carouselStyles.dotActive]}
              />
            ))}
          </View>

          <TouchableOpacity
            onPress={() => setPairIndex((i) => Math.min(maxPairs - 1, i + 1))}
            disabled={pairIndex === maxPairs - 1}
            style={[carouselStyles.navBtn, pairIndex === maxPairs - 1 && carouselStyles.navBtnDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[carouselStyles.navArrow, pairIndex === maxPairs - 1 && carouselStyles.navArrowDisabled]}>
              ›
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const carouselStyles = StyleSheet.create({
  container: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  counter: {
    color: Colors.textTertiary,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  imageCol: {
    flex: 1,
  },
  typeLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
    textAlign: 'center',
  },
  thumb: {
    width: '100%',
    height: IMAGE_THUMB_HEIGHT,
    borderRadius: 6,
    backgroundColor: Colors.surface,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  placeholderText: {
    color: Colors.textTertiary,
    fontSize: 20,
  },
  zoomHint: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  zoomHintText: {
    color: '#fff',
    fontSize: 13,
  },
  divider: {
    width: 1,
    marginHorizontal: Spacing.sm,
    backgroundColor: Colors.divider,
    alignSelf: 'stretch',
    marginTop: 18,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.md,
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navArrow: {
    color: Colors.primary,
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  navArrowDisabled: {
    color: Colors.textTertiary,
  },
  dots: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  dotActive: {
    width: 14,
    backgroundColor: Colors.primary,
  },
});

// ─── Finding card ─────────────────────────────────────────────────────────────

function FindingCard({ finding }: { finding: Record<string, unknown> }) {
  const severityKey = typeof finding.severity === 'string' ? finding.severity : 'minor';
  const severity = SEVERITY_CONFIG[severityKey] ?? SEVERITY_CONFIG.minor;
  const rawConfidence = typeof finding.confidence === 'number' ? finding.confidence : 0;
  const confidencePct = Math.round(rawConfidence * 100);
  const itemName = (finding.item ?? finding.type ?? 'Item') as string;
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
            <Text style={[styles.metaLabel, Typography.caption]}>Confidence</Text>
            <View style={styles.confidenceBar}>
              <ProgressBar progress={confidencePct} color={severity.color} height={6} />
            </View>
            <Text style={[styles.confidenceValue, Typography.caption]}>
              {confidencePct}%
            </Text>
          </View>

          {wearAndTear && (
            <View style={styles.wearBadge}>
              <Text style={[styles.wearText, Typography.caption]}>Normal wear & tear</Text>
            </View>
          )}
        </View>
      )}

      {locationInImage ? (
        <Text style={[styles.locationText, Typography.caption]}>
          Location: {locationInImage}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Room card ────────────────────────────────────────────────────────────────

function RoomCard({
  result,
  checkinUrls,
  checkoutUrls,
  isExpanded,
  onToggle,
  onImagePress,
}: {
  result: AnalysisResult;
  checkinUrls: string[];
  checkoutUrls: string[];
  isExpanded: boolean;
  onToggle: () => void;
  onImagePress: (state: ZoomModalState) => void;
}) {
  const condition = CONDITION_CONFIG[result.overall_condition] ?? CONDITION_CONFIG.unknown;
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const findingsCount = findings.length;
  const damageCount = findings.filter(
    (f) => f.severity !== 'none' && !f.wear_and_tear,
  ).length;
  const hasImages = checkinUrls.length > 0 || checkoutUrls.length > 0;

  return (
    <Card style={styles.roomCard}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.roomHeader}>
          <View style={styles.roomInfo}>
            <Text style={[styles.roomName, Typography.heading4]}>
              {getRoomLabel(result.room)}
            </Text>
            <Badge label={condition.label} variant={condition.variant} size="small" />
          </View>
          <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
        </View>

        <Text
          style={[styles.roomSummary, Typography.bodySmall]}
          numberOfLines={isExpanded ? undefined : 2}
        >
          {result.summary || 'No description.'}
        </Text>

        <View style={styles.roomStats}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, Typography.heading4]}>{findingsCount}</Text>
            <Text style={[styles.statLabel, Typography.caption]}>
              {findingsCount === 1 ? 'finding' : 'findings'}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text
              style={[styles.statValue, Typography.heading4, damageCount > 0 && { color: Colors.error }]}
            >
              {damageCount}
            </Text>
            <Text style={[styles.statLabel, Typography.caption]}>
              {damageCount === 1 ? 'damage' : 'damages'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Image pair carousel — always visible */}
      {hasImages && (
        <>
          <Divider style={styles.imagesDivider} />
          <ImagePairCarousel
            checkinUrls={checkinUrls}
            checkoutUrls={checkoutUrls}
            onImagePress={onImagePress}
          />
        </>
      )}

      {/* Findings — only when expanded */}
      {isExpanded && (
        <>
          <Divider style={styles.findingsDivider} />
          {findingsCount === 0 ? (
            <Text style={[styles.noFindings, Typography.body]}>
              No damage found.
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AnalysisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { analysis: rawAnalysis, setAnalysis } = useContractsStore();
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [checkinImages, setCheckinImages] = useState<InspectionImage[]>([]);
  const [checkoutImages, setCheckoutImages] = useState<InspectionImage[]>([]);
  const [zoomModal, setZoomModal] = useState<ZoomModalState | null>(null);

  const analysis = Array.isArray(rawAnalysis) ? rawAnalysis : [];

  const imagesByRoom = useMemo(() => {
    const map: Record<string, { checkin: string[]; checkout: string[] }> = {};
    for (const img of checkinImages) {
      if (!map[img.room_id]) map[img.room_id] = { checkin: [], checkout: [] };
      map[img.room_id].checkin.push(img.image_url);
    }
    for (const img of checkoutImages) {
      if (!map[img.room_id]) map[img.room_id] = { checkin: [], checkout: [] };
      map[img.room_id].checkout.push(img.image_url);
    }
    return map;
  }, [checkinImages, checkoutImages]);

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    if (!id) { setLoading(false); return; }
    try {
      const [analysisResp, checkinResp, checkoutResp] = await Promise.all([
        analysisService.getAnalysisResults(id),
        contractsService.getInspectionImages(id, 'checkin'),
        contractsService.getInspectionImages(id, 'checkout'),
      ]);
      setAnalysis(Array.isArray(analysisResp.analysis) ? analysisResp.analysis : []);
      setCheckinImages(checkinResp.images);
      setCheckoutImages(checkoutResp.images);
    } catch (error) {
      console.error('Error loading analysis:', error);
      Alert.alert('Error', 'Unable to load analysis results.');
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

  const expandAll = () => setExpandedRooms(new Set(analysis.map((r) => r.room_id)));
  const collapseAll = () => setExpandedRooms(new Set());

  if (loading) return <LoadingSpinner />;

  if (analysis.length === 0) {
    return (
      <EmptyState
        title="No analysis results"
        description="AI analysis has not completed yet or there is no data to display."
        icon="🔍"
      />
    );
  }

  const totalFindings = analysis.reduce(
    (sum, r) => sum + (Array.isArray(r.findings) ? r.findings.length : 0),
    0,
  );
  const totalDamage = analysis.reduce(
    (sum, r) =>
      sum +
      (Array.isArray(r.findings)
        ? r.findings.filter((f) => f.severity !== 'none' && !f.wear_and_tear).length
        : 0),
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
          label="← Back"
          onPress={() => router.back()}
          variant="outline"
          size="small"
          style={styles.backButton}
        />

        <Text style={[styles.title, Typography.heading2]}>AI Analysis</Text>
        <Text style={[styles.subtitle, Typography.bodySmall]}>
          Automated property condition analysis based on photos
        </Text>

        {/* Overview */}
        <Card style={styles.overviewCard}>
          <View style={styles.overviewRow}>
            <View style={styles.overviewStat}>
              <Text style={[styles.overviewValue, Typography.heading2]}>
                {analysis.length}
              </Text>
              <Text style={[styles.overviewLabel, Typography.caption]}>rooms</Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewStat}>
              <Text style={[styles.overviewValue, Typography.heading2]}>
                {totalFindings}
              </Text>
              <Text style={[styles.overviewLabel, Typography.caption]}>
                {totalFindings === 1 ? 'finding' : 'findings'}
              </Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewStat}>
              <Text
                style={[
                  styles.overviewValue,
                  Typography.heading2,
                  totalDamage > 0 && { color: Colors.error },
                ]}
              >
                {totalDamage}
              </Text>
              <Text style={[styles.overviewLabel, Typography.caption]}>
                {totalDamage === 1 ? 'damage' : 'damages'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Expand/collapse */}
        <TouchableOpacity
          onPress={allExpanded ? collapseAll : expandAll}
          style={styles.toggleRow}
        >
          <Text style={[styles.toggleText, Typography.bodySmall]}>
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Text>
        </TouchableOpacity>

        {/* Room cards */}
        {analysis.map((result, idx) => {
          const roomImages = imagesByRoom[result.room_id] ?? { checkin: [], checkout: [] };
          return (
            <RoomCard
              key={`${result.room_id}-${idx}`}
              result={result}
              checkinUrls={roomImages.checkin}
              checkoutUrls={roomImages.checkout}
              isExpanded={expandedRooms.has(result.room_id)}
              onToggle={() => toggleRoom(result.room_id)}
              onImagePress={setZoomModal}
            />
          );
        })}

        <Button
          label="View settlement"
          onPress={() => router.push(`/contract/${id}/settlement`)}
          fullWidth
          style={styles.settlementButton}
        />
      </ScrollView>

      {zoomModal && (
        <ImageZoomModal state={zoomModal} onClose={() => setZoomModal(null)} />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  imagesDivider: {
    marginVertical: Spacing.md,
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
