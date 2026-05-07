import { StyleSheet } from 'react-native';

export const appStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  centered: {
    justifyContent: 'center',
  },
  titleLg: {
    fontSize: 20,
    fontWeight: '700',
  },
  titleMd: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: '500',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 14,
    marginTop: 3,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
  noVersesText: {
    fontSize: 14,
    color: '#999',
  },
  listContent: {
    gap: 12,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d1d6',
    padding: 16,
    gap: 12,
  },
  cardColumn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d1d6',
    padding: 16,
  },
  cardText: {
    flex: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  logoContainer: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#d1d1d6',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a6ef5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
  },
  progressFill: {
    width: '20%',
    height: 4,
    backgroundColor: '#1a6ef5',
    borderRadius: 2,
  },
  progressFillRecorded: {
    width: '40%',
    height: 4,
    backgroundColor: '#1a6ef5',
    borderRadius: 2,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d1d6',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  accordionLabel: {
    fontSize: 14,
  },
  sourceTextScroll: {
    maxHeight: 120,
    marginTop: 10,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  sourceText: {
    fontSize: 14,
    lineHeight: 24,
    color: '#333',
  },
  recordBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: 12,
  },
  deleteBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 8,
  },
  chipsScroll: {
    flexGrow: 0,
    paddingVertical: 12,
  },
  chipsContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  chip: {
    minWidth: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d1d6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeChip: {
    borderWidth: 2,
    borderColor: '#1a6ef5',
  },
  chipText: {
    fontSize: 16,
  },
  activeChipText: {
    color: '#1a6ef5',
    fontWeight: '600',
  },
  chipMic: {
    position: 'absolute',
    top: 3,
    right: 4,
  },
  refreshingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    gap: 8,
  },
  refreshingText: {
    fontSize: 12,
    color: '#666',
  },
});
