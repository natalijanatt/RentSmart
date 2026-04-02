import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../../constants/theme';
import { Button } from './Button';
import { Contract } from '@rentsmart/contracts';

interface BlockchainSuccessModalProps {
  visible: boolean;
  contract: Contract | null;
  onContinue: () => void;
}

export const BlockchainSuccessModal: React.FC<BlockchainSuccessModalProps> = ({
  visible,
  contract,
  onContinue,
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const chainAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0);
      fadeAnim.setValue(0);
      chainAnim.setValue(0);

      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 60,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(chainAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const hasBlockchain = !!(contract?.solana_pda || contract?.solana_tx_init);

  const truncate = (str: string, len = 20) =>
    str.length > len ? `${str.slice(0, len / 2)}...${str.slice(-len / 2)}` : str;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.sheet, { transform: [{ scale: scaleAnim }] }]}>
          {/* Success icon */}
          <View style={styles.iconRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="checkmark" size={36} color={Colors.background} />
            </View>
          </View>

          <Text style={[styles.title, Typography.heading3]}>Contract Created</Text>
          <Text style={[styles.subtitle, Typography.bodySmall]}>
            Your rental contract has been created and secured.
          </Text>

          {/* Invite code */}
          <View style={styles.inviteBox}>
            <Text style={[styles.inviteLabel, Typography.caption]}>INVITE CODE</Text>
            <Text style={[styles.inviteCode, Typography.heading4]}>
              {contract?.invite_code ?? '—'}
            </Text>
            <Text style={[styles.inviteHint, Typography.caption]}>
              Share this with your tenant to accept the contract
            </Text>
          </View>

          {/* Blockchain section */}
          <Animated.View style={[styles.blockchainSection, { opacity: fadeAnim }]}>
            <View style={styles.blockchainHeader}>
              <MaterialCommunityIcons
                name="link-variant"
                size={16}
                color={hasBlockchain ? Colors.primary : Colors.textTertiary}
              />
              <Text
                style={[
                  styles.blockchainLabel,
                  Typography.caption,
                  { color: hasBlockchain ? Colors.primary : Colors.textTertiary },
                ]}
              >
                {hasBlockchain ? 'SECURED ON SOLANA BLOCKCHAIN' : 'BLOCKCHAIN NOT CONFIGURED'}
              </Text>
            </View>

            {hasBlockchain ? (
              <Animated.View style={{ opacity: chainAnim }}>
                {/* Chain visualization */}
                <View style={styles.chainRow}>
                  <BlockNode label="Contract\nHash" icon="file-document-outline" active />
                  <ChainLink />
                  <BlockNode label="Solana\nPDA" icon="cube-outline" active />
                  <ChainLink />
                  <BlockNode label="On-Chain\nRecord" icon="shield-check-outline" active />
                </View>

                <View style={styles.detailsBox}>
                  {contract?.contract_hash && (
                    <DetailRow
                      label="Contract Hash"
                      value={truncate(contract.contract_hash, 24)}
                    />
                  )}
                  {contract?.solana_pda && (
                    <DetailRow label="PDA Address" value={truncate(contract.solana_pda, 24)} />
                  )}
                  {contract?.solana_tx_init && (
                    <DetailRow label="Init Tx" value={truncate(contract.solana_tx_init, 24)} />
                  )}
                </View>

                <Text style={[styles.blockchainNote, Typography.caption]}>
                  Contract terms are immutably recorded on Solana Devnet. All inspections and
                  settlements will be cryptographically verified.
                </Text>
              </Animated.View>
            ) : (
              <Text style={[styles.blockchainNote, Typography.caption]}>
                Blockchain verification is optional. Contract details are securely stored in the
                database.
              </Text>
            )}
          </Animated.View>

          <Button label="View Contract" onPress={onContinue} fullWidth style={styles.ctaButton} />
        </Animated.View>
      </View>
    </Modal>
  );
};

const BlockNode: React.FC<{ label: string; icon: string; active?: boolean }> = ({
  label,
  icon,
  active,
}) => (
  <View style={styles.blockNodeContainer}>
    <View style={[styles.blockNode, active && styles.blockNodeActive]}>
      <MaterialCommunityIcons
        name={icon as any}
        size={18}
        color={active ? Colors.primary : Colors.textTertiary}
      />
    </View>
    <Text style={[styles.blockNodeLabel, Typography.caption]}>{label}</Text>
  </View>
);

const ChainLink: React.FC = () => (
  <View style={styles.chainLink}>
    <View style={styles.chainDot} />
    <View style={styles.chainDot} />
    <View style={styles.chainDot} />
  </View>
);

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={[styles.detailLabel, Typography.caption]}>{label}</Text>
    <Text style={[styles.detailValue, Typography.caption]} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: '100%',
    ...Shadows.large,
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
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
  inviteBox: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inviteLabel: {
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  inviteCode: {
    color: Colors.primary,
    letterSpacing: 4,
    marginBottom: Spacing.xs,
  },
  inviteHint: {
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  blockchainSection: {
    marginBottom: Spacing.xl,
  },
  blockchainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  blockchainLabel: {
    letterSpacing: 1,
  },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  blockNodeContainer: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  blockNode: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockNodeActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(217, 161, 65, 0.1)',
  },
  blockNodeLabel: {
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
  },
  chainLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.lg,
  },
  chainDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    opacity: 0.6,
  },
  detailsBox: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  detailLabel: {
    color: Colors.textTertiary,
    flex: 1,
  },
  detailValue: {
    color: Colors.text,
    fontFamily: 'monospace',
    flex: 2,
    textAlign: 'right',
  },
  blockchainNote: {
    color: Colors.textTertiary,
    lineHeight: 16,
  },
  ctaButton: {
    marginTop: Spacing.sm,
  },
});
